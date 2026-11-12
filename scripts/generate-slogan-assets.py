"""Rasterize the fixed slogan in the approved light handwritten style.

The tiny LXGW WenKai TC font subset contains only the slogan's characters.
It is a build input under scripts/ (excluded from the mini-program package).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[1]
font=ImageFont.truetype(str(root/'scripts/fonts/slogan-hand.ttf'),96)
color='#60331F'

def render(lines,name,gap=22):
    boxes=[font.getbbox(line) for line in lines]
    heights=[b[3]-b[1] for b in boxes]
    width=max(b[2]-b[0] for b in boxes)+24
    height=sum(heights)+gap*(len(lines)-1)+24
    image=Image.new('RGBA',(width,height))
    draw=ImageDraw.Draw(image)
    y=12
    for line,box,h in zip(lines,boxes,heights):
        x=(width-(box[2]-box[0]))/2-box[0]
        draw.text((x,y-box[1]),line,font=font,fill=color)
        y+=h+gap
    image.save(root/'assets'/name,optimize=True)
    print(name,image.size)

render(['记录每一餐，吃出更好的自己'],'slogan-home.png')
render(['记录每一餐，','吃出更好的自己'],'slogan-welcome.png',gap=26)
