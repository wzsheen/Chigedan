from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[1]
assets=root/'assets'
Image.open(assets/'logo.png').convert('RGBA').resize((256,256),Image.Resampling.LANCZOS).save(assets/'brand-logo.png',optimize=True)

# Rasterized local calligraphy avoids loadFontFace and font-format differences
# across Android/iOS. It contains the three brand characters only.
font=ImageFont.truetype('C:/Windows/Fonts/DFKai71.ttf',200)
box=font.getbbox('吃个蛋')
title=Image.new('RGBA',(box[2]-box[0]+28,box[3]-box[1]+28))
ImageDraw.Draw(title).text((14-box[0],14-box[1]),'吃个蛋',font=font,fill='#462512')
title.save(assets/'brand-wordmark.png',optimize=True)

out=assets/'digits'
out.mkdir(exist_ok=True)
segments={
    'a':[(16,6),(84,6),(94,16),(84,26),(16,26),(6,16)],
    'g':[(16,80),(84,80),(94,90),(84,100),(16,100),(6,90)],
    'd':[(16,154),(84,154),(94,164),(84,174),(16,174),(6,164)],
    'f':[(4,24),(14,30),(24,36),(24,70),(14,80),(4,86)],
    'b':[(96,24),(86,30),(76,36),(76,70),(86,80),(96,86)],
    'e':[(4,94),(14,100),(24,110),(24,144),(14,150),(4,156)],
    'c':[(96,94),(86,100),(76,110),(76,144),(86,150),(96,156)],
}
mapping=['ab cdef'.replace(' ',''),'bc','abged','abgcd','fgbc','afgcd','afgecd','abc','abcdefg','abfgcd']
for digit,keys in enumerate(mapping):
    image=Image.new('RGBA',(200,360))
    draw=ImageDraw.Draw(image)
    for key in keys:draw.polygon([(x*2,y*2) for x,y in segments[key]],fill='#432B1D')
    image.save(out/(str(digit)+'.png'),optimize=True)
dot=Image.new('RGBA',(40,360));ImageDraw.Draw(dot).rounded_rectangle((8,308,36,336),5,fill='#432B1D');dot.save(out/'dot.png')

# A genuine pen silhouette: contrasting shaft, eraser band, wood tip and graphite.
pen=Image.new('RGBA',(160,160))
draw=ImageDraw.Draw(pen)
draw.rounded_rectangle((63,20,97,113),8,fill='#FFE298',outline='#59351F',width=6)
draw.line((69,39,91,39),fill='#59351F',width=5)
draw.line((80,48,80,105),fill='#A27A45',width=3)
draw.polygon([(64,112),(96,112),(80,143)],fill='#FFF3D7',outline='#59351F',width=5)
draw.polygon([(74,131),(86,131),(80,143)],fill='#59351F')
pen=pen.rotate(-38,Image.Resampling.BICUBIC)
pen.save(assets/'icons'/'line-pencil.png',optimize=True)
print('Generated local logo, handwritten wordmark, seven-segment digits and pen icon')
