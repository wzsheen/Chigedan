"""Build the approved compact capability icons; no external dependencies beyond Pillow."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'ai'
COLORS = {'eye':'#278CA5','wrench':'#B78227','brain':'#8962AE','mic':'#B7658D',
          'video':'#487EB2','text':'#667C92','file':'#44958A','embedding':'#6D9560','rerank':'#BC8150'}

def build(key, color):
    im = Image.new('RGBA', (192,192))
    d = ImageDraw.Draw(im)
    def points(pts): return [(round(x*4),round(y*4)) for x,y in pts]
    def line(pts,w=2.7): d.line(points(pts),fill=color,width=round(w*4),joint='curve')
    def ellipse(box,w=2.5,fill=None): d.ellipse(tuple(round(v*4) for v in box),outline=color,width=round(w*4),fill=fill)
    def rect(box,r=4): d.rounded_rectangle(tuple(round(v*4) for v in box),radius=r*4,outline=color,width=10)
    if key=='eye':
        pts=[(5+38*t/40,24-12*math.sin(math.pi*t/40)) for t in range(41)]
        pts += [(43-38*t/40,24+12*math.sin(math.pi*t/40)) for t in range(41)]
        line(pts+[pts[0]]);ellipse((18,18,30,30))
    elif key=='wrench':
        line([(29,6),(28,16),(35,21),(43,16),(43,8)],2.8)
        line([(43,8),(45,21),(39,28),(29,28),(12,44),(5,37),(22,20),(21,10),(29,6)],2.8)
    elif key=='brain':
        line([(23,40),(15,42),(9,37),(9,31),(5,25),(8,18),(8,12),(14,7),(20,8),(24,13),(28,8),(34,7),(40,12),(40,18),(43,25),(39,31),(39,37),(33,42),(25,40)])
        line([(24,13),(24,39)]);line([(13,16),(18,20),(15,26),(19,31)]);line([(35,16),(30,20),(33,26),(29,31)])
    elif key=='mic':
        rect((18,5,30,29),6);line([(12,22),(12,28),(17,35),(24,37),(31,35),(36,28),(36,22)])
        line([(24,37),(24,44)]);line([(17,44),(31,44)])
    elif key=='video':
        rect((5,12,31,36));line([(31,20),(43,13),(43,35),(31,28)])
    elif key=='text':
        line([(7,8),(41,8),(41,32),(25,32),(15,41),(15,32),(7,32),(7,8)])
        line([(15,17),(33,17)],2.4);line([(15,24),(28,24)],2.4)
    elif key=='file':
        line([(12,5),(29,5),(38,15),(38,43),(12,43),(12,5)])
        line([(29,5),(29,16),(38,16)]);line([(18,25),(32,25)]);line([(18,33),(29,33)])
    elif key=='embedding':
        line([(11,12),(38,14),(24,39),(11,12)],2)
        for x,y in [(11,12),(38,14),(24,39)]: ellipse((x-4,y-4,x+4,y+4),1.5,color)
    elif key=='rerank':
        for y,end in [(11,25),(23,20),(35,15)]: line([(7,y),(end,y)],3)
        line([(36,8),(36,39)]);line([(30,33),(36,39),(42,33)])
    im.resize((64,64),Image.Resampling.LANCZOS).save(OUT/('cap-'+key+'.png'),optimize=True)

for key,color in COLORS.items(): build(key,color)
