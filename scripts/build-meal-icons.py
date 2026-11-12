"""Draw the compact local meal catalog icons (requires Pillow)."""
import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'meal-icons'
OUT.mkdir(exist_ok=True)
DATA = json.loads(subprocess.check_output([
    'node', '-e', "const m=require('./utils/meal-catalog');"
    "console.log(JSON.stringify({categories:m.categories,foods:m.rows([], {})}))"
], cwd=ROOT, encoding='utf-8'))

INK = '#8b5438'
CREAM = '#fff1cf'
GOLD = '#f8b848'
GREEN = '#68a751'
RED = '#e96a54'


def draw_icon(name, category, variant):
    image = Image.new('RGBA', (96, 96))
    draw = ImageDraw.Draw(image)
    seed = hashlib.sha256(name.encode()).digest()
    palette = ['#e87846', '#ba6742', '#f3ad53', '#cb8752', '#e69153', '#ab704e']
    tint = palette[seed[0] % len(palette)]
    def ellipse(box, color, border=None):
        draw.ellipse(box, fill=color, outline=border, width=3)
    def box(bounds, color, radius=9, border=INK):
        draw.rounded_rectangle(bounds, radius, fill=color, outline=border, width=3)
    def line(points, color=INK, width=4):
        draw.line(points, fill=color, width=width, joint='curve')
    def garnish(x, y, color=GREEN):
        ellipse((x, y, x+13, y+9), color)
        line([(x+3, y+7), (x+10, y+2)], '#e5edac', 2)
    def plate():
        ellipse((8, 25, 88, 83), '#eccdb0', INK)
        ellipse((11, 24, 85, 76), '#fff6e1', INK)
    def bowl(color='#e7a459'):
        draw.pieslice((11, 13, 85, 79), 0, 180, fill=color, outline=INK, width=3)
        ellipse((11, 33, 85, 59), '#fff4dd', INK)
        line([(30, 72), (66, 72)], '#ffda99', 3)
    if name == '常吃':
        pts = [(48, 11), (58, 35), (84, 37), (64, 54), (70, 80), (48, 66), (25, 80), (31, 54), (11, 37), (38, 35)]
        draw.polygon(pts, fill=GOLD)
        line(pts+[pts[0]], INK, 3)
        line([(43, 27), (39, 39), (27, 41)], '#fff4c2', 4)
    elif name == '我的':
        box((17, 11, 79, 84), '#f8d481', 15)
        ellipse((36, 22, 60, 46), '#fff6df', INK)
        draw.pieslice((29, 48, 67, 85), 180, 360, fill='#fff6df', outline=INK, width=3)
    elif name == '新增':
        ellipse((13, 13, 83, 83), '#ffdb70', INK)
        line([(48, 31), (48, 65)], INK, 6)
        line([(31, 48), (65, 48)], INK, 6)
    elif category == '饮品':
        color = '#8d5039' if any(s in name for s in ('可乐', '咖啡')) else '#ffac48' if '汁' in name else '#f3d59a'
        if '奶茶' in name:
            color = '#d69b6d'
        shape = variant % 3
        if '无糖' in name:
            color = '#846e63' if '可乐' in name else '#eedbb4'
        if '美式' in name:
            color = '#684636'
        if '啤酒' in name:
            color = '#eeb24b'
        if '罐' in name or '可乐' in name or shape == 0:
            box((29, 16, 67, 83), color)
            ellipse((29, 12, 67, 26), '#f0dec2', INK)
            box((32, 40, 64, 58), ['#f8d98e', '#ffa168', '#ebf0ba'][seed[1] % 3], 4)
        else:
            draw.polygon([(21, 28), (75, 28), (66, 82), (30, 82)], fill=color)
            line([(21, 28), (30, 82), (66, 82), (75, 28)], INK, 3)
            line([(55, 40), (64, 16), (77, 16)], '#bd6745', 5)
            box((18, 24, 78, 33), '#fff2cd', 4)
            if shape == 1:
                ellipse((39, 45, 57, 62), '#fff4ce')
            else:
                line([(35, 52), (61, 52)], '#fff4ce', 5)
    elif category == '快餐':
        if '汉堡' in name:
            box((15, 27, 81, 73), GOLD, 19)
            box((15, 50, 81, 64), '#83ad52', 5)
            box((18, 54, 78, 65), '#ab6545', 5)
            for x in (32, 46, 58):
                line([(x, 39), (x+5, 37)], '#fff0c2', 3)
        elif '披萨' in name:
            draw.polygon([(17, 19), (82, 28), (45, 81)], fill='#ffd783', outline=INK, width=3)
            line([(17, 19), (82, 28)], '#be7946', 8)
            for x, y in ((30, 33), (51, 39), (43, 54)):
                ellipse((x, y, x+12, y+12), RED)
        else:
            layout = {'全素': (0, 3), '一荤两素': (1, 2), '两荤一素': (2, 1), '一荤一素': (1, 1), '两荤两素': (2, 2)}
            trays = {'全素': '#95b761', '一荤两素': '#efb555', '两荤一素': '#d78050',
                     '一荤一素': '#de9e76', '两荤两素': '#b48b65'}
            tray = trays.get(name, tint)
            box((5, 19, 91, 80), tray, 13 if name != '一荤一素' else 23)
            box((10, 23, 86, 73), '#fff0d1', 10)
            ellipse((14, 29, 47, 68), '#fffdf3', '#d9b992')
            meats, vegs = layout.get(name, (1, 2))
            for i in range(vegs):
                x, y = 53+(i%2)*13, 31+i*11
                ellipse((x, y, x+18, y+15), ['#83b550', '#5d9548', '#e9a84d'][i], '#6a8245')
                line([(x+4, y+11), (x+12, y+5)], '#eff0ae', 2)
            for i in range(meats):
                x, y = 48+i*12, 50-i*17
                box((x, y, x+24, y+16), '#b8663c' if i else '#dc8146', 5)
                line([(x+5, y+5), (x+17, y+5)], '#f5b472', 2)
    elif category == '水果':
        fruit_color = '#f9cd58' if any(s in name for s in ('香蕉', '梨', '芒果')) else '#a376ad' if '葡萄' in name else '#f69a45' if '橙' in name else '#9eb75e' if '猕猴桃' in name else RED
        if '葡萄' in name or '莓' in name:
            for x, y in [(29, 28), (48, 28), (20, 43), (39, 43), (58, 43), (31, 57), (49, 57), (40, 70)]:
                ellipse((x, y, x+18, y+17), fruit_color, INK)
        elif '香蕉' in name:
            draw.arc((19, 19, 77, 75), 20, 160, fill=INK, width=19)
            draw.arc((19, 19, 77, 75), 20, 160, fill=fruit_color, width=13)
        elif '西瓜' in name:
            draw.pieslice((11, 3, 85, 81), 0, 180, fill=GREEN, outline=INK, width=3)
            draw.pieslice((16, 7, 80, 75), 0, 180, fill=RED)
            for x, y in ((30, 49), (49, 47), (60, 54), (43, 63)):
                ellipse((x, y, x+4, y+6), INK)
        elif '梨' in name:
            ellipse((30, 28, 66, 68), '#d9ce68', INK)
            ellipse((20, 45, 76, 82), '#d9ce68', INK)
        elif '芒果' in name:
            ellipse((18, 32, 79, 76), fruit_color, INK)
            line([(32, 42), (44, 39)], '#fff2a6', 4)
        else:
            ellipse((20, 29, 76, 82), fruit_color, INK)
            ellipse((28, 37, 37, 50), '#ffd5a0')
        line([(47, 32), (52, 18)], INK, 4)
        garnish(51, 16)
    elif category == '主食':
        if any(s in name for s in ('面包', '吐司', '馒头', '包子')):
            box((22, 24, 74, 76), tint, 15)
            box((28, 30, 68, 70), CREAM, 12, None)
            for x, y in ((36, 43), (48, 52), (54, 41)):
                ellipse((x, y, x+6, y+5), '#e5b77c')
        else:
            bowl('#c99b67' if '粥' in name else tint)
            if any(s in name for s in ('面', '粉', '米线')):
                for y in (42, 46, 50):
                    line([(23, y), (33, y-3), (43, y+2), (54, y-2), (67, y)], GOLD, 3)
                if '牛肉' in name or '肥肠' in name:
                    box((28, 36, 43, 45), '#a36542', 3)
                    box((48, 43, 62, 51), '#b57247', 3)
                elif '辣' in name or '小面' in name:
                    line([(24, 39), (36, 43), (42, 37)], RED, 4)
                line([(52, 37), (80, 12)], INK, 3)
                line([(57, 39), (86, 16)], '#b47a49', 3)
            else:
                for x, y in ((26, 43), (37, 40), (48, 43), (60, 41), (34, 48), (54, 49)):
                    grain = '#ead2a7' if '燕麦' in name else '#f5c962' if '小米' in name else '#f7dca5' if '糙' in name or '炒' in name else '#ffffff'
                    ellipse((x, y, x+9, y+5), grain)
            garnish(63, 40)
    elif category == '蛋奶豆':
        plate()
        if '奶' in name:
            box((24, 22, 72, 78), '#b5d3c0' if '酸' in name else '#c4deee', 10)
            box((28, 16, 68, 30), '#fff0d1', 6)
            ellipse((38, 42, 58, 62), '#fff9ea', INK)
        elif '糕' in name:
            box((20, 43, 74, 69), '#e4a35c', 6)
            box((20, 33, 74, 47), '#fff3d8', 5)
            garnish(45, 24, RED)
        elif '豆' in name:
            for x, y in ((21, 39), (42, 31), (53, 48)):
                box((x, y, x+21, y+16), CREAM if '腐' in name else '#aa6946' if '卤' in name else '#dda16e', 4)
        elif '煮' in name or name == '鸡蛋':
            ellipse((27, 22, 68, 73), '#fff8e1' if '煮' in name else '#eabf8f', INK)
            if '煮' in name:
                ellipse((36, 36, 60, 60), GOLD, '#e7a343')
        else:
            ellipse((20, 32, 72, 69), '#fffdf1', '#d7a974')
            ellipse((36, 39, 59, 62), GOLD, '#e7a343')
            ellipse((40, 42, 46, 48), '#ffdd85')
    elif category == '蔬菜':
        plate()
        for i in range(5):
            x = 20 + (i*11+seed[2]) % 39
            y = 31 + (i*8+seed[3]) % 23
            color = '#e87a51' if '番茄' in name or '胡萝卜' in name else ['#81b555', '#598c49', '#a6c36b'][i % 3]
            ellipse((x, y, x+22, y+15), color, INK)
            line([(x+5, y+11), (x+16, y+4)], '#e5edac', 2)
    elif category == '荤菜':
        plate()
        if '鱼' in name:
            ellipse((20, 34, 65, 65), tint, INK)
            draw.polygon([(63, 48), (78, 33), (78, 65)], fill=tint, outline=INK, width=3)
            ellipse((27, 44, 32, 49), INK)
            line([(44, 42), (50, 55)], CREAM, 3)
        elif '鸡' in name and variant % 2 == 0:
            line([(50, 49), (72, 65)], CREAM, 12)
            ellipse((19, 29, 61, 60), tint, INK)
            ellipse((26, 34, 44, 42), '#ffbd6f')
        else:
            for i in range(3):
                x, y = 21+i*13, 37+(variant+i*7)%14
                box((x, y, x+22, y+15), tint, 5)
                line([(x+4, y+4), (x+12, y+4)], '#ffd098', 2)
        garnish(56, 63)
    elif any(s in name for s in ('饺子', '馄饨', '抄手', '小笼')):
        if any(s in name for s in ('汤', '抄手', '馄饨')):
            bowl('#db9859')
            ellipse((15, 34, 81, 58), '#f6cc81' if '清' in name or '馄饨' in name else '#e98756')
        else:
            plate()
        for x, y in ((21, 40), (40, 32), (55, 46)):
            draw.pieslice((x, y, x+22, y+19), 178, 360, fill=CREAM, outline=INK, width=3)
            line([(x+7, y+4), (x+10, y+8), (x+15, y+4)], '#bd8a5e', 2)
    elif any(s in name for s in ('冰粉', '凉虾', '汤圆')):
        bowl('#d99b72')
        ellipse((14, 33, 82, 59), '#c98859' if '冰粉' in name or '凉虾' in name else '#e9bb82')
        for x, y in ((26, 40), (37, 47), (48, 36), (60, 43)):
            ellipse((x, y, x+11, y+8), '#ffe9ba' if '冰粉' in name else '#fff9e9', INK)
    elif any(s in name for s in ('苕皮', '糍粑', '桃片', '三角粑')):
        plate()
        for x, y in ((20, 37), (37, 32), (49, 48)):
            box((x, y, x+26, y+15), '#b7744b' if '苕皮' in name else '#e7ad62', 4)
            line([(x+5, y+6), (x+18, y+4)], '#ffd78b', 2)
        garnish(65, 62)
    elif any(s in name for s in ('麻花', '油条', '薯条', '薯片')):
        plate()
        for i in range(4):
            x, y = 22+i*10, 31+(i%2)*12
            box((x, y, x+(10 if '薯片' not in name else 20), y+31), GOLD, 5)
            line([(x+4, y+6), (x+4, y+22)], '#ffdfa4', 2)
    else:
        plate()
        if any(s in name for s in ('串', '烤', '小吃')):
            line([(23, 66), (73, 24)], INK, 4)
            for i in range(4):
                x, y = 25+i*10, 49-i*8
                ellipse((x, y, x+17, y+16), tint, INK)
        else:
            for i in range(3):
                x, y = 20+i*15, 34+(variant+i*5)%12
                ellipse((x, y, x+22, y+22), tint, INK)
                line([(x+6, y+7), (x+13, y+5)], '#ffdda3', 3)
        garnish(58, 62)
    return image.resize((48, 48), Image.Resampling.LANCZOS)


def save(name, category, key, variant=0):
    draw_icon(name, category, variant).quantize(colors=72, method=Image.Quantize.FASTOCTREE).save(OUT / f'{key}.png', optimize=True)
    return f'/assets/meal-icons/{key}.png'


categories = {row['name']: save(row['name'], row['name'], f'category-{i:02}')
              for i, row in enumerate(DATA['categories'])}
categories['新增'] = save('新增', '', 'add')
foods = {}
for i, row in enumerate(DATA['foods']):
    key = hashlib.sha256(row['name'].encode()).hexdigest()[:10]
    foods[row['name']] = save(row['name'], row['category'], key, i)
(ROOT / 'utils' / 'meal-icon-data.js').write_text(
    '// Generated by scripts/build-meal-icons.py.\nmodule.exports = '
    + json.dumps({'categories': categories, 'foods': foods}, ensure_ascii=False, indent=2) + ';\n',
    encoding='utf-8',
)
