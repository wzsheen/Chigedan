"""Build six transparent festival strips into the mini-program sprite atlas.
Source PNGs named spring.png, lantern.png, dragonboat.png, midautumn.png,
halloween.png, christmas.png are supplied with --source-dir and stay outside the app.
"""
import argparse
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from PIL import Image

parser=argparse.ArgumentParser()
parser.add_argument('--source-dir',required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
names=['spring','lantern','dragonboat','midautumn','halloween','christmas']
atlas=Image.new('RGBA',(1536,1664))
for row,name in enumerate(names):
    image=Image.open(Path(args.source_dir)/(name+'.png')).convert('RGBA')
    pixels=np.array(image)
    diff=np.minimum(pixels[:,:,1].astype(int)-pixels[:,:,0],pixels[:,:,1].astype(int)-pixels[:,:,2])
    foreground=diff<100
    counts=foreground.sum(axis=0)
    boundaries=[0]
    for i in range(1,6):
        center=round(image.width*i/6)
        candidates=range(max(boundaries[-1]+1,center-45),min(image.width,center+46))
        boundaries.append(min(candidates,key=lambda x:(counts[x],abs(x-center))))
    boundaries.append(image.width)
    tiles=[]
    for i in range(6):
        a=pixels[:,boundaries[i]:boundaries[i+1]].copy()
        delta=diff[:,boundaries[i]:boundaries[i+1]]
        a[:,:,3]=np.clip((100-delta)*5,0,255).astype('uint8')
        tile=Image.fromarray(a);box=tile.getbbox()
        if not box:raise ValueError(name+' missing frame '+str(i))
        tiles.append(tile.crop(box))
    scale=min(186/max(t.width for t in tiles),192/max(t.height for t in tiles))
    for col,tile in enumerate(tiles):
        tile=tile.resize((max(1,round(tile.width*scale)),max(1,round(tile.height*scale))),Image.Resampling.LANCZOS)
        atlas.alpha_composite(tile,(col*192+(192-tile.width)//2,row*208+200-tile.height))
    print(name,boundaries)
output=root/'mascot-motion/assets/festival-atlas.png'
with tempfile.TemporaryDirectory() as folder:
    raw=Path(folder)/'festival-atlas-rgba.png'
    atlas.save(raw,optimize=True)
    subprocess.run(['magick',str(raw),'-colors','256','-define','png:compression-level=9','PNG8:'+str(output)],check=True)
print('Festival atlas bytes:',output.stat().st_size)
