const {withTheme}=require('../../utils/theme');
const knowledge = require('../../utils/knowledge');
const QUIZZES = {
    portion: ['包装上每份的营养值一定等于这次吃下的量吗？', ['一定相同', '还要核对实际份量'], 1],
    labels: ['比较两种食品前，先看什么？', ['计量基准是否一致', '包装颜色'], 0],
    plate: ['点外卖时，哪种观察方式更全面？', ['只看热量', '同时看看主食、蔬菜和蛋白质食物'], 1],
    macros: ['同样的热量，营养组成一定相同吗？', ['不一定', '一定相同'], 0],
    grain: ['食品颜色可以代替配料表吗？', ['可以', '不能'], 1],
    bmi: ['BMI 可以直接告诉你体脂比例吗？', ['不能', '可以'], 0],
};
const ICONS = { grain:'card-meals', label:'line-science', plate:'line-lunch', body:'card-body' };
function readIds() {
    const value=wx.getStorageSync('cal_knowledge_read');
    return Array.isArray(value) ? Array.from(new Set(value.filter(id=>knowledge.ARTICLES.some(article=>article.id===id)))) : [];
}
Page(withTheme({
    data: { categories:knowledge.CATEGORIES, category:'全部', query:'', articles:[], article:null, readCount:0,
        totalCount:knowledge.ARTICLES.length, readProgress:0, quizIndex:-1, quizRevealed:false, showSources:false, nextArticle:null },
    onLoad(options) { this.filter(); if(options && options.id) this.openArticle(options.id); },
    handleCategory(event) { this.setData({category:event.currentTarget.dataset.category}); this.filter(); },
    handleSearch(event) { this.setData({query:event.detail.value}); this.filter(); },
    filter() {
        const ids=readIds();
        this.setData({articles:knowledge.filterArticles(this.data.category,this.data.query).map(article=>Object.assign({},article,{icon:ICONS[article.art],cover:'/assets/knowledge/'+article.id+'.svg',read:ids.includes(article.id)})),readCount:ids.length,readProgress:Math.round(ids.length/knowledge.ARTICLES.length*100)});
    },
    openArticle(id) {
        const article=knowledge.getArticle(id);
        if(!article) return;
        const index=knowledge.ARTICLES.findIndex(row=>row.id===id);
        this.setData({article:Object.assign({},article,{cover:'/assets/knowledge/'+article.id+'.svg',steps:article.sections.map((section,index)=>({number:index+1,title:section[0],paragraphs:section[1].split('。').filter(Boolean).map(line=>line+'。')})),quiz:QUIZZES[id]}),quizIndex:-1,quizRevealed:false,showSources:false,nextArticle:knowledge.ARTICLES[(index+1)%knowledge.ARTICLES.length]});
    },
    handleArticle(event) { this.openArticle(event.currentTarget.dataset.id); wx.pageScrollTo({scrollTop:0,duration:200}); },
    handleCloseArticle() { this.setData({article:null}); this.filter(); wx.pageScrollTo({scrollTop:0,duration:200}); },
    handleRead() {
        if(!this.data.article) return;
        const ids=readIds(); if(!ids.includes(this.data.article.id)) ids.push(this.data.article.id);
        wx.setStorageSync('cal_knowledge_read',ids); this.filter();
        wx.showToast({title:'已标记读完',icon:'success'});
    },
    handleQuiz(event) {
        const quiz=this.data.article && this.data.article.quiz;
        const index=Number(event.currentTarget.dataset.index);
        if(!quiz || !Number.isInteger(index) || index<0 || index>=quiz[1].length) return;
        this.setData({quizIndex:index,quizRevealed:true});
    },
    handleReveal() { if(this.data.quizIndex<0) {wx.showToast({title:'先选一个答案吧',icon:'none'});return;} this.setData({quizRevealed:!this.data.quizRevealed}); },
    handleSources() { this.setData({showSources:!this.data.showSources}); },
    handleCopySource(event) { const ref=this.data.article.references[Number(event.currentTarget.dataset.index)]; if(ref) wx.setClipboardData({data:ref.url}); },
}));
