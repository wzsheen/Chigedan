from PIL import Image, ImageDraw
from pathlib import Path
S=2

def icon(kind,style,size):
    z=4
    pic=Image.new('RGBA',(100*z,100*z))
    p=ImageDraw.Draw(pic)
    line='#98703D' if style==0 else '#A67D39'
    gold=['#FFDD72','#FFD450','#F7CF63'][style]
    light=['#FFF7D8','#FFF0BA','#FFF9E7'][style]
    width=2.6
    def poly(pts,fill):p.polygon([(int(x*z),int(y*z)) for x,y in pts],fill=fill)
    def path(pts,col=line,w=width):
        p.line([(int(x*z),int(y*z)) for x,y in pts],fill=col,width=int(w*z),joint='curve')
        r=w*z/2
        for x,y in [pts[0],pts[-1]]:p.ellipse((x*z-r,y*z-r,x*z+r,y*z+r),fill=col)
    def curve(a,b,c,e,col=line,w=width):
        pts=[]
        for i in range(61):
            t=i/60;u=1-t
            pts.append((u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*e[0],u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*e[1]))
        path(pts,col,w)
    def oval(box,fill=None,stroke=line,w=width):p.ellipse(tuple(int(v*z) for v in box),fill,stroke,int(w*z))
    def rect(box,r,fill=None,stroke=line,w=width):p.rounded_rectangle(tuple(int(v*z) for v in box),int(r*z),fill,stroke,int(w*z))
    def arc(box,a,b,col=line,w=width):p.arc(tuple(int(v*z) for v in box),a,b,col,int(w*z))
    def sparkle(x,y):path([(x,y-5),(x,y+5)],gold,2);path([(x-5,y),(x+5,y)],gold,2)
    if kind==5:
        # Breakfast: one fried egg with a gently irregular white and round yolk.
        points=[(22,40),(25,32),(34,28),(42,29),(49,24),(60,25),(67,32),(77,35),(81,44),(78,51),(81,60),(76,69),(65,72),(59,78),(48,77),(41,73),(30,74),(22,67),(20,58),(16,50),(18,43),(22,40)]
        poly(points,'#FFFEF8')
        path(points,line,2.6)
        oval((35,36,65,66),gold,None)
        arc((40,41,60,61),205,265,'#FFF2BD',2)
    elif kind==0:
        if style==0:
            rect((24,26,76,77),11,'#FFFEF8');path([(24,41),(76,41)])
            path([(37,21),(37,31)]);path([(63,21),(63,31)])
            oval((41,49,59,67),gold,None);path([(35,72),(65,72)],'#EAD8AF',2)
        elif style==1:
            poly([(20,45),(50,20),(80,45),(75,45),(75,78),(25,78),(25,45)],gold)
            path([(20,45),(50,20),(80,45)],line,3)
            rect((27,44,73,79),9,gold,None)
            oval((40,46,60,70),'#FFFEF6',None);oval((46,54,57,65),'#F2B93C',None)
        else:
            oval((31,35,69,73),gold,None)
            path([(22,73),(78,73)])
            for a,b in [((50,22),(50,28)),((24,36),(29,40)),((76,36),(71,40)),((16,56),(24,56)),((76,56),(84,56))]:path([a,b])
            path([(38,82),(62,82)],'#C7AB73',2)
    elif kind==1:
        if style==1:
            oval((30,20,70,62),gold,None)
            path([(38,65),(62,65)]);path([(41,73),(59,73)]);path([(45,79),(55,79)])
            curve((50,58),(49,46),(37,44),(40,34),'#FFFEF6',3)
            curve((50,58),(50,43),(63,43),(61,32),'#FFFEF6',3)
            sparkle(78,25)
        else:
            poly([(18,32),(43,27),(50,34),(57,27),(82,32),(82,73),(57,69),(50,75),(43,69),(18,73)],light)
            path([(50,35),(50,75)])
            curve((50,35),(40,26),(29,27),(18,32));path([(18,32),(18,73)])
            curve((18,73),(31,68),(41,68),(50,75))
            curve((50,35),(60,26),(71,27),(82,32));path([(82,32),(82,73)])
            curve((82,73),(69,68),(59,68),(50,75))
            if style==0:
                path([(27,43),(39,41)],gold,3);path([(27,53),(39,51)],'#D3BB88',2)
                path([(61,43),(73,45)],gold,3);path([(61,53),(73,55)],'#D3BB88',2)
            else:
                poly([(58,46),(65,39),(73,45),(72,54),(64,60),(58,53)],gold);sparkle(78,20)
    elif kind==2:
        if style==2:
            rect((20,37,80,77),10,light)
            path([(49,39),(49,75)]);path([(51,57),(78,57)])
            oval((28,45,42,62),'#FFDC73',None);oval((57,43,69,51),gold,None)
            path([(31,22),(73,28)],line,2.7);path([(30,29),(72,35)],line,2.7)
        elif style==1:
            oval((24,27,76,79),gold,None);oval((32,35,68,71),'#FFF9E8',None)
            oval((43,44,61,62),'#FFD65B',None)
            path([(15,30),(15,78)]);path([(9,29),(9,43),(21,43),(21,29)]);path([(84,29),(84,78)])
            curve((84,29),(75,40),(77,51),(84,53))
        else:
            poly([(22,48),(78,48),(73,67),(62,77),(38,77),(27,67)],light)
            curve((22,48),(25,83),(75,83),(78,48));path([(20,48),(80,48)])
            path([(40,79),(60,79)]);oval((31,35,45,46),gold,None);oval((45,32,61,46),gold,None);oval((59,36,70,46),gold,None)
            path([(35,18),(76,27)]);path([(33,25),(74,34)])
    elif kind==3:
        if style==1:
            poly([(21,49),(79,49),(72,69),(60,77),(40,77),(28,69)],gold)
            curve((21,49),(27,84),(73,84),(79,49),line)
            path([(20,49),(80,49)]);path([(40,79),(60,79)])
            curve((39,39),(30,31),(43,28),(37,20),line,2)
            curve((54,39),(45,31),(58,28),(52,20),line,2)
            oval((68,16,84,32),'#E6C071',None);oval((73,12,88,27),'#FFFCF4',None)
        else:
            oval((45,31,55,41),gold,line,2)
            p.pieslice((22*z,39*z,78*z,95*z),180,360,fill=light)
            arc((22,39,78,95),180,360)
            path([(20,67),(80,67)]);path([(26,74),(74,74)])
            curve((33,58),(35,50),(40,47),(43,46),'#E7BC5F',2)
            oval((70,18,85,33),gold,None);oval((75,14,89,28),'#FFFCF4',None)
    else:
        # A water glass in every set; no isolated water-drop symbol.
        if style==1:
            rect((27,22,67,79),9,'#FFF6D8',None)
            curve((68,35),(90,32),(90,64),(68,62),line,3)
            poly([(30,47),(64,47),(64,73),(60,77),(35,77),(30,72)],gold)
            path([(34,30),(34,41)],'#FFFFFF',3)
            curve((30,47),(42,42),(53,53),(64,47),line,2)
            path([(24,82),(73,82)],'#D1B98A',2)
        else:
            poly([(28,23),(72,23),(66,77),(34,77)],'#FFFEF7')
            poly([(32,49),(68,49),(65,74),(35,74)],gold)
            curve((32,49),(43,44),(55,54),(68,49),'#C89A40',2)
            path([(28,23),(34,77),(66,77),(72,23)])
            oval((28,19,72,29),'#FFFCEF',line,2)
            path([(38,34),(40,44)],'#E3D8BF',2)
            if style==2:
                oval((23,81,77,87),'#F1E5C5',None);sparkle(80,37)
    if style==2:
        # restrained highlights to suggest translucent material, never blur the contour
        path([(31,32),(34,29)],'#FFFFFF',2)
    return pic.resize((int(size*S),int(size*S)),Image.Resampling.LANCZOS)

if __name__ == "__main__":
    out=Path(__file__).resolve().parents[1]/"assets"/"icons"
    out.mkdir(parents=True,exist_ok=True)
    for kind,name in enumerate(["today","science","lunch","dinner","water"]):
        asset=icon(kind,0,96)
        asset.save(out/("line-"+name+".png"))
        if name=="today":
            inactive=asset.copy()
            pixels=inactive.load()
            for y in range(inactive.height):
                for x in range(inactive.width):
                    r,g,b,a=pixels[x,y]
                    if a:
                        pixels[x,y]=(181,162,145,a) if r<220 else (242,234,215,a)
            inactive.save(out/"line-today-inactive.png")
    print("Generated A-series icons in",out)
    icon(5,0,96).save(out/'line-breakfast.png')
