"""Assemble approved ImageGen strips using the bundled pet asset tools.

Usage: python scripts/build-mascot-atlas.py --run-dir <artwork-run> --pet-scripts <pet-skill/scripts>
Source art and QA stay outside the shipped app; only the atlas and fallbacks ship.
"""
import argparse
import json
from pathlib import Path
import runpy
import subprocess
import sys
from PIL import Image, ImageDraw

parser=argparse.ArgumentParser()
parser.add_argument('--run-dir',required=True)
parser.add_argument('--pet-scripts',required=True)
args=parser.parse_args()
run=Path(args.run_dir).resolve()
tools=Path(args.pet_scripts).resolve()
root=Path(__file__).resolve().parents[1]
states={'idle':6,'waving':4,'success':5,'balanced':6,'adjust':6,'water':6,'sleep':6}
frames=run/'qa/rows'

# The mini-program's semantic states differ from the desktop pet catalog.
# Extend names in memory; keep the actual bundled extraction/QA algorithms.
for state in states:
    frame_root=frames/state/'frames'
    key='#FF00FF' if state in ('balanced','adjust') else '#00FF00'
    for script,argv in [
        ('extract_strip_frames.py',['--decoded-dir',str(run/'decoded'),'--output-dir',str(frame_root),'--states',state,'--method','auto','--chroma-key',key]),
        ('inspect_frames.py',['--frames-root',str(frame_root),'--json-out',str(frames/state/'frame-review.json'),'--states',state,'--require-components']),
    ]:
        module=runpy.run_path(str(tools/script))
        module['ROW_FRAME_COUNTS'].update(states)
        sys.argv=[script]+argv
        try:
            module['main']()
        except SystemExit as result:
            if result.code not in (None,0):
                raise

compose=runpy.run_path(str(tools/'compose_atlas.py'))
raw=Image.new('RGBA',(1536,1456))
for row,(state,count) in enumerate(states.items()):
    strip=Image.new('RGBA',(1536,208))
    for col in range(count):
        compose['paste_centered'](strip,Image.open(frames/state/'frames'/state/f'{col:02}.png'),0,col)
    source=frames/state/'row-raw.png'
    cleaned=frames/state/'row.png'
    compose['save_outputs'](strip,source,None)
    key='#FF00FF' if state in ('balanced','adjust') else '#00FF00'
    subprocess.run([sys.executable,str(tools/'despill_chroma_edges.py'),str(source),
        '--output',str(cleaned),'--json-out',str(frames/state/'chroma-report.json'),'--chroma-key',key],check=True)
    raw.alpha_composite(Image.open(cleaned).convert('RGBA'),(0,row*208))
dest=root/'mascot-motion/assets/egg-atlas.png'
dest.parent.mkdir(parents=True,exist_ok=True)
compose['save_outputs'](raw,dest,None)
atlas=raw
atlas.save(dest,optimize=True)
manifest={'width':1536,'height':1456,'cellWidth':192,'cellHeight':208,'columns':8,
    'rows':[{'state':s,'row':r,'count':n} for r,(s,n) in enumerate(states.items())],
    'source':'ImageGen, grounded in user-approved egg mascot; pet-tool extraction, composition and edge cleanup.'}
(dest.parent/'egg-atlas.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
render=runpy.run_path(str(tools/'render_animation_previews.py'))
previews=run/'qa/all-previews'
previews.mkdir(exist_ok=True)
durations={'idle':[650,120,90,90,90,380],'waving':[140,140,140,280],
    'success':[300,140,220,160,1200],'balanced':[650,200,120,200,650,1100],
    'adjust':[600,250,200,350,550,850],'water':[500,250,450,450,300,900],'sleep':[650,250,400,450,600,1200]}
contact=Image.new('RGB',(192*6,232*6),(255,250,238))
for row,(state,count) in enumerate(states.items()):
    tiles=[atlas.crop((c*192,row*208,(c+1)*192,(row+1)*208)) for c in range(count)]
    if state!='waving':
        # Main-package static artwork matches the actual animated first pose.
        tiles[0].save(root/'assets/mascot'/f'{state}-0.png',optimize=True)
    opaque=[]
    for tile in tiles:
        bg=Image.new('RGBA',(192,208),(255,250,238,255));bg.alpha_composite(tile);opaque.append(bg.convert('RGB'))
    render['save_preview'](opaque,durations[state],previews/f'{state}.gif')
    if state!='waving':
        y=list(s for s in states if s!='waving').index(state)*232
        for c,tile in enumerate(tiles):contact.paste(tile,(c*192,y+24),tile)
        ImageDraw.Draw(contact).text((8,y+6),state,fill=(93,65,38))
contact.save(run/'qa/all-state-contact.png')
print('Atlas bytes:',dest.stat().st_size)
print('All 39 source poses assembled; complete mini-program states, not a desktop-pet upload.')
