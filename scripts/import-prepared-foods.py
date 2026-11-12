"""将成品食物补充 CSV 去重后追加到本地食物库。"""
import csv
import json
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / 'utils' / 'china-food-data.js'


def normalized(value):
    return unicodedata.normalize('NFKC', value or '').strip()


def number(value):
    if not (value or '').strip():
        return None
    result = float(value)
    if result < 0:
        raise ValueError('数值不能为负')
    return result


def main(source):
    text = TARGET.read_text(encoding='utf-8')
    database = json.loads(text[text.index('['):text.rindex(']') + 1])
    script = "global.wx={getStorageSync(){return []}};process.stdout.write(JSON.stringify(require('./utils/meal-catalog').rows([],{}).map(x=>({name:x.name,aliases:x.aliases||[]}))))"
    catalog = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, encoding='utf-8'))
    known = {normalized(name) for row in database + catalog for name in [row['name']] + row.get('aliases', []) if name}
    ids = {row['id'] for row in database}
    added, duplicates = [], []
    with open(source, encoding='utf-8-sig', newline='') as file:
        for row in csv.DictReader(file):
            name = normalized(row['名称'])
            if not name:
                raise ValueError('发现空食物名称')
            if name in known:
                duplicates.append(name)
                continue
            identifier = row['编号'].strip()
            if not identifier or identifier in ids:
                raise ValueError('编号为空或冲突: ' + identifier)
            grams = number(row['一份g（入口）'])
            kcal = number(row['每100g kcal'])
            if not grams or grams > 10000 or kcal is None:
                raise ValueError('缺少有效重量或热量: ' + name)
            def per100(field):
                value = number(row[field])
                return None if value is None else round(value * 100 / grams, 4)
            added.append({
                'id': identifier, 'name': name, 'aliases': [], 'category': row['类别'].strip(),
                'state': '复合成品', 'description': row['一份描述'].strip(), 'grams': grams,
                'per100g': {'kcal': kcal, 'protein': per100('蛋白质g'), 'fat': per100('脂肪g'),
                            'carb': per100('碳水g'), 'sodium': per100('钠mg')},
                'source': row['数据来源'].strip(), 'confidence': row['置信度'].strip(), 'note': row['备注'].strip(),
                'originalCategory': row['类别'].strip(), 'subcategory': row['款式'].strip(),
            })
            known.add(name)
            ids.add(identifier)
    output = '// 中国食物营养总库，按每100克保存，缺失值为 null。\nmodule.exports = ' + json.dumps(database + added, ensure_ascii=False, separators=(',', ':')) + ';\n'
    TARGET.write_text(output, encoding='utf-8')
    print('新增:', len(added), '跳过重复:', len(duplicates))
    print('重复名称:', '、'.join(duplicates) or '无')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('用法: python scripts/import-prepared-foods.py 补充库.csv')
    main(sys.argv[1])
