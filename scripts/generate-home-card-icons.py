"""Small section symbols matched to the approved home card layout."""
from pathlib import Path
from PIL import Image,ImageDraw
out=Path(__file__).resolve().parents[1]/'assets/icons'
S=4
def create(kind):
    im=Image.new('RGBA',(96*S,96*S));d=ImageDraw.Draw(im)
    def line(points,color,width=4):
        d.line([(int(x*S),int(y*S)) for x,y in points],fill=color,width=int(width*S),joint='curve')
        r=width*S/2
        for x,y in [points[0],points[-1]]:d.ellipse((x*S-r,y*S-r,x*S+r,y*S+r),fill=color)
    def oval(box,fill=None,stroke=None,width=3):d.ellipse(tuple(int(n*S) for n in box),fill,stroke,int(width*S))
    if kind=='body':
        green='#26AF32'
        oval((38,12,59,33),'#F4FFF0',green,3)
        d.arc(tuple(int(n*S) for n in (17,27,79,91)),185,355,fill=green,width=3*S)
        line([(32,78),(32,59),(37,47),(59,47),(65,59),(65,78)],green,3)
        line([(48,57),(48,67)],green,3)
        oval((46,73,50,77),green)
        line([(39,81),(39,72)],green,3);line([(57,81),(57,72)],green,3)
    elif kind=='meals':
        gold='#FFAD14'
        line([(28,16),(28,40),(32,47),(39,47),(44,40),(44,16)],gold,4)
        line([(36,16),(36,38)],gold,4)
        line([(36,46),(36,80)],gold,5)
        oval((57,15,71,43),gold)
        line([(64,38),(64,80)],gold,5)
    else:
        # A simple fixed green leaf reads consistently on iOS and Android.
        leaf=Image.new('RGBA',im.size);ld=ImageDraw.Draw(leaf)
        ld.ellipse((26*S,17*S,69*S,76*S),fill='#80C734')
        leaf=leaf.rotate(-31,Image.Resampling.BICUBIC)
        im.alpha_composite(leaf)
        d=ImageDraw.Draw(im)
        line([(27,79),(67,29)],'#4B9D25',3)
        line([(43,59),(36,44)],'#D6F0B5',2)
        line([(48,52),(65,50)],'#D6F0B5',2)
    im.resize((96,96),Image.Resampling.LANCZOS).save(out/f'card-{kind}.png',optimize=True)
for kind in ['body','meals','leaf']:create(kind)
