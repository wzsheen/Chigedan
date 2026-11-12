const {withTheme}=require('../../utils/theme');
const recipeContent = require('../../utils/recipe-content');
const { buildState } = require('../../utils/diet-state');
const { createRecordStore, formatDate } = require('../../utils/record-store.js');
const settings = require('../../utils/settings.js');
const units = require('../../utils/units.js');
const advice = require('../../utils/advice.js');

const store = createRecordStore({ storageKey: 'cal_records' });

Page(withTheme({
    data: {
        // 页顶两个 tab：饮食建议 / 食谱库，点哪个显示哪个
        tab: 'advice',
        state: 'loading',
        todayText: '',
        headline: '',
        summary: '',
        status: 'balanced',
        rows: [],
        // 营养结构：三色堆叠成一根 100% 的条
        macroStack: [],
        macroEmpty: true,
        // 「接下来这样吃」：按餐次 tab 分类，点哪个看哪餐的建议；默认停在当前时段对应的餐次
        mealTabs: advice.MEAL_META,
        activeMeal: '',
        mealRecipes: [],
        expandedId: '',
        foods: [],
        energyUnit: 'kcal',
        emptyTitle: '',
        emptyDesc: '',
        // 食谱库：横向餐次 tab 切换，点哪餐看哪餐的全部搭配；默认同样跟时段走
        recipeTotal: advice.RECIPES.length,
        libraryGroups: [],
        libMeal: '',
        libRecipes: [],
        libExpandedId: '',
        query: '',
        libLabel: '',
        libCount: 0,
    },

    onLoad() {
        // 两个默认餐次都按当前时段定位：早上进来停在早餐，晚上停在晚餐
        const meal = advice.mealOfHour(new Date().getHours());
        const groups = this.buildLibrary();
        const defaultGroup = groups.find(g => g.key === meal) || groups[0];
        this.setData({
            libraryGroups: groups,
            libRecipes: defaultGroup.items,
            libMeal: meal,
            activeMeal: meal,
            libLabel: defaultGroup.label,
            libCount: defaultGroup.items.length,
        });
        this.refresh();
    },

    onShow() {
        if (this.loaded) {
            this.refresh();
        }
        this.loaded = true;
    },

    buildDateText(date) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return (date.getMonth() + 1) + '月' + date.getDate() + '日 · 周' + weekdays[date.getDay()];
    },

    refresh() {
        const that = this;
        const today = formatDate(new Date());
        const goal = settings.getGoal();
        this.setData({libraryGroups: this.buildLibrary()});
        this.filterLibrary();
        this.setData({
            todayText: this.buildDateText(new Date()),
            energyUnit: units.energyUnitLabel(),
        });
        return store.list().then(result => {
            if (result.error) {
                that.setData({
                    state: 'error',
                    diet: null,
                    mealRecipes: [],
                    emptyTitle: '读取记录失败',
                    emptyDesc: '回到首页重新进入试试',
                });
                return;
            }
            const records = result.data.filter(item => item.date === today);
            that.compute(records, goal);
        });
    },

    // 一张搭配卡的展示数据：建议区和食谱库共用，保证两边长得一样。
    buildCard(id) {
        const recipe = advice.getRecipe(id);
        if (recipe === null) {
            return null;
        }
        const stat = advice.calcRecipe(recipe);
        const art = recipeContent.recipeImage(recipe);
        return {
            id: recipe.id,
            meal: recipe.meal,
            icon: recipe.icon,
            tags: recipe.tags,
            why: recipe.why,
            title: recipeContent.TITLES[recipe.id] || stat.partsText,
            subtitle: recipe.parts.map(item => item[0]).join(' · '),
            artSrc: art.src,
            artStyle: art.style,
            energyText: units.energyText(stat.kcal),
            kcal: stat.kcal,
            protein: stat.protein,
            carb: stat.carb,
            fat: stat.fat,
            macroText: '约 ' + units.energyText(stat.kcal)
                + ' · 蛋白 ' + advice.formatGram(stat.protein) + ' g'
                + ' · 碳水 ' + advice.formatGram(stat.carb) + ' g · 脂肪 ' + advice.formatGram(stat.fat) + ' g',
            lines: advice.buildRecipeLines(recipe).map(line => Object.assign({}, line, {kcalText: units.energyText(line.kcal)})),
        };
    },

    // 食谱库：4 组，组内按热量从低到高。
    buildLibrary() {
        const groups = [];
        for (let i = 0; i < advice.MEAL_META.length; i += 1) {
            const meal = advice.MEAL_META[i];
            const items = [];
            for (let j = 0; j < advice.RECIPES.length; j += 1) {
                const recipe = advice.RECIPES[j];
                if (recipe.meal !== meal.key) {
                    continue;
                }
                const card = this.buildCard(recipe.id);
                if (card !== null) {
                    items.push(card);
                }
            }
            items.sort((left, right) => left.kcal - right.kcal);
            groups.push({
                key: meal.key,
                label: meal.label,
                icon: meal.icon,
                countText: items.length + ' 套',
                items: items,
            });
        }
        return groups;
    },

    // 组装当前餐次的 3 条建议：营养数据有就按方向挑，没有就按通用口味挑。
    buildMealRecipes(mealKey, direction, remaining) {
        const hasRemaining = Number.isFinite(remaining);
        const picked = advice.pickRecipesByMeal(mealKey, direction, {
            remainingKcal: hasRemaining ? remaining : undefined,
        });
        const list = [];
        for (let i = 0; i < picked.length; i += 1) {
            const item = picked[i];
            const card = this.buildCard(item.id);
            if (card === null) {
                continue;
            }
            card.overText = item.over && hasRemaining && remaining >= 0
                ? '参考份量高于当前目标余量，可按实际需要调整'
                : '';
            list.push(card);
        }
        return list;
    },

    compute(records, goal) {
        this.nutritionMissing=records.some(row=>row.nutritionStatus==='incomplete');
        const hour = new Date().getHours();
        this.nextMeal = advice.nextMealKey(hour);
        const totals = records.reduce((sum, row) => ({ total: sum.total + (Number(row.kcal) || 0), protein: sum.protein + (Number(row.protein) || 0), carb: sum.carb + (Number(row.carb) || 0), fat: sum.fat + (Number(row.fat) || 0) }), {total:0,protein:0,carb:0,fat:0});
        this.setData({ diet: buildState(Object.assign({count:records.length,goal,hour,nutritionMissing:this.nutritionMissing},totals)), intakeText: units.energyText(totals.total), goalText: units.energyText(goal) });

        if (records.length === 0) {
            // 一条没记也能看搭配（食谱库并进来了），只是不给营养结构分析。
            const direction = advice.resolveDirection(null);
            this.setData({
                state: 'empty',
                emptyTitle: '今天还没有记录',
                emptyDesc: '记一笔后这里会分析今天的营养结构；下面的搭配随时可以照着吃',
                activeMeal: this.data.activeMeal || this.nextMeal,
                mealRecipes: this.buildMealRecipes(this.data.activeMeal || this.nextMeal, direction, null),
                rows: [],
                macroStack: [],
                macroEmpty: true,
                foods: [],
            });
            return;
        }

        let total = 0;
        let protein = 0;
        let carb = 0;
        let fat = 0;
        for (let i = 0; i < records.length; i += 1) {
            total += Number(records[i].kcal) || 0;
            protein += Number(records[i].protein) || 0;
            carb += Number(records[i].carb) || 0;
            fat += Number(records[i].fat) || 0;
        }

        const shares = this.nutritionMissing ? null : advice.calcShares(protein, carb, fat);
        const direction = advice.resolveDirection(shares);
        const rows = advice.buildMacroRows(shares);
        const stack = advice.buildMacroStack(rows);
        const remaining = goal - total;

        let status = 'balanced';
        let headline = '今天吃得很稳';
        let summary = '';

        if (shares === null) {
            status = 'nomacro';
            headline = '营养数据还不完整';
            summary = '记录里没有碳水、蛋白、脂肪，看不出结构，下次记一笔时顺手填上就行';
        } else if (direction.key === 'high') {
            status = 'high';
            headline = '今天' + direction.macro.label + '偏高';
            summary = direction.macro.label + '占 ' + Math.round(shares[direction.macro.key])
                + '%，比建议区间高出 ' + Math.round(direction.macro.diff) + ' 个百分点';
        } else if (direction.key === 'low') {
            status = 'low';
            headline = '今天' + direction.macro.label + '偏低';
            summary = direction.macro.label + '占 ' + Math.round(shares[direction.macro.key])
                + '%，比建议区间低了 ' + Math.round(direction.macro.diff) + ' 个百分点';
        } else {
            summary = '碳水、蛋白、脂肪都在建议区间内，按这个节奏吃就好';
        }

        if (remaining >= 0) {
            summary += '。今天额度还剩 ' + units.energyText(remaining);
        } else {
            summary += '。今天已经超出 ' + units.energyText(-remaining);
        }

        const foods = advice.pickFoods(direction).map(item => ({
            name: item.name,
            unit: item.unit,
            kcal: item.kcal,
            protein: item.protein,
            carb: item.carb,
            fat: item.fat,
            kcalText: units.energyText(item.kcal),
            proteinText: item.proteinText,
        }));

        this.setData({
            state: 'ready',
            status: status,
            headline: headline,
            summary: summary,
            rows: rows,
            macroStack: stack.segments,
            macroEmpty: stack.empty,
            activeMeal: this.data.activeMeal || this.nextMeal,
            mealRecipes: this.buildMealRecipes(this.data.activeMeal || this.nextMeal, direction, remaining),
            foods: foods,
        });
    },

    // 切餐次 tab：重挑 3 条，收起已展开的明细。有记录就按今天的方向与余量挑，没有就按通用口味挑。
    handleMealTab(event) {
        const key = event.currentTarget.dataset.key;
        if (key === this.data.activeMeal) {
            return;
        }
        const that = this;
        store.list().then(result => {
            if (result.error) {
                that.setData({ activeMeal: key, mealRecipes: [], expandedId: '' });
                return;
            }
            const today = formatDate(new Date());
            const records = result.data.filter(item => item.date === today);
            if (records.length === 0) {
                that.setData({
                    activeMeal: key,
                    mealRecipes: that.buildMealRecipes(key, advice.resolveDirection(null), null),
                    expandedId: '',
                });
                return;
            }
            this.nutritionMissing=records.some(row=>row.nutritionStatus==='incomplete');
            let total = 0;
            let protein = 0;
            let carb = 0;
            let fat = 0;
            for (let i = 0; i < records.length; i += 1) {
                total += Number(records[i].kcal) || 0;
                protein += Number(records[i].protein) || 0;
                carb += Number(records[i].carb) || 0;
                fat += Number(records[i].fat) || 0;
            }
            const direction = advice.resolveDirection(this.nutritionMissing ? null : advice.calcShares(protein, carb, fat));
            that.setData({
                activeMeal: key,
                mealRecipes: that.buildMealRecipes(key, direction, settings.getGoal() - total),
                expandedId: '',
            });
        });
    },

    // 页顶切 tab：饮食建议 / 食谱库。
    handleTab(event) {
        const key = event.currentTarget.dataset.key;
        if (key === this.data.tab) {
            return;
        }
        this.setData({ tab: key });
    },

    // 食谱库：切餐次 tab，只显示该餐的全部搭配，展开项随手清掉。
    handleLibMeal(event) {
        const key = event.currentTarget.dataset.key;
        if (!advice.MEAL_META.some(item => item.key === key)) return;
        this.setData({libMeal:key,libExpandedId:''});
        this.filterLibrary();
    },
    handleSearch(event) { this.setData({query:event.detail.value,libExpandedId:''}); this.filterLibrary(); },
    filterLibrary() {
        const group = this.data.libraryGroups.find(item => item.key === this.data.libMeal);
        const query = this.data.query.trim();
        const items = group ? group.items.filter(item => !query || (item.title + item.subtitle).includes(query)) : [];
        this.setData({libRecipes:items,libLabel:group ? group.label : '',libCount:group ? group.items.length : 0});
    },

    // 点卡片展开/收起明细：建议区和食谱库各记各的展开项，互不影响。
    handleToggleRecipe(event) {
        const id = event.currentTarget.dataset.id;
        if (this.data.tab === 'library') {
            this.setData({ libExpandedId: this.data.libExpandedId === id ? '' : id });
        } else {
            this.setData({ expandedId: this.data.expandedId === id ? '' : id });
        }
    },

    buildAddUrl(params) {
        const keys = Object.keys(params);
        const parts = [];
        for (let i = 0; i < keys.length; i += 1) {
            parts.push(keys[i] + '=' + encodeURIComponent(params[keys[i]]));
        }
        return '/pages/add/add?' + parts.join('&');
    },

    // 整套搭配记一笔：建议区和食谱库都走这里，餐次跟着这套搭配自己的餐次走。
    handleRecord(event) {
        const id = event.currentTarget.dataset.id;
        const card = this.buildCard(id);
        if (card === null) {
            return;
        }
        wx.navigateTo({ url: '/pages/add/add?recipe=' + encodeURIComponent(id) });
    },

    handleRecordFood(event) {
        const name = event.currentTarget.dataset.name;
        let target = null;
        for (let i = 0; i < this.data.foods.length; i += 1) {
            if (this.data.foods[i].name === name) {
                target = this.data.foods[i];
            }
        }
        if (target === null) {
            return;
        }
        wx.navigateTo({
            url: this.buildAddUrl({
                from: 'advice',
                name: target.name,
                kcal: target.kcal,
                p: target.protein,
                c: target.carb,
                f: target.fat,
                unit: target.unit,
                qty: 1,
                meal: this.nextMeal || 'snack',
            }),
        });
    },

    handleBack() {
        wx.navigateBack();
    },
    handleKnowledge() { wx.navigateTo({ url: '/pages/knowledge/knowledge?id=plate' }); },
}));
