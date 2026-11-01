import json,pathlib,numpy as np
from PIL import Image,ImageDraw,ImageFont
from scipy.ndimage import label,find_objects
out=pathlib.Path('/Volumes/Media/immortal-qa/integration2');shots=out/'shots'
font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',22)
checks=[]
pairs=[('05-first-screen',shots/'05-first-screen-before.png',shots/'05-first-screen-after.png'),('01-world-full',shots/'fixed-before/01-world-full.png',shots/'fixed-after/01-world-full.png'),('02-gate-end',shots/'fixed-before/02-gate-southbridge-closeup.png',shots/'fixed-after/02-gate-southbridge-closeup.png'),('03-east-bridge-platform',shots/'fixed-before/03-east-bridge-platform.png',shots/'fixed-after/03-east-bridge-platform.png')]
for name,before,after in pairs:
 a=np.array(Image.open(before).convert('RGBA'));b=np.array(Image.open(after).convert('RGBA'));assert a.shape==b.shape
 mask=np.any(a!=b,axis=2);count=int(mask.sum());ys,xs=np.where(mask)
 row={'name':name,'differentPixels':count,'totalPixels':int(mask.size),'size':[a.shape[1],a.shape[0]],'bbox':([int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)] if count else None)};checks.append(row)
 diff=np.zeros_like(a);diff[:,:,3]=255;diff[mask]=[255,0,160,255];Image.fromarray(diff).save(shots/(name+'-diff.png'))
 if count:
  # Largest difference clusters, before/after/difference side by side at exact 3x nearest.
  labels,n=label(mask);regions=find_objects(labels);regions=sorted((r for r in regions if r),key=lambda r:(r[0].stop-r[0].start)*(r[1].stop-r[1].start),reverse=True)[:6]
  panels=[]
  for region in regions:
   y,x=region;left=max(0,x.start-5);top=max(0,y.start-5);right=min(a.shape[1],x.stop+5);bottom=min(a.shape[0],y.stop+5)
   # Cap panorama clusters to a representative 180x160 source-pixel crop.
   right=min(right,left+180);bottom=min(bottom,top+160)
   crops=[Image.fromarray(v[top:bottom,left:right]).resize(((right-left)*3,(bottom-top)*3),Image.Resampling.NEAREST) for v in [a,b,diff]]
   panel=Image.new('RGB',(sum(i.width for i in crops),crops[0].height+35),'white');d=ImageDraw.Draw(panel);d.text((5,2),f'前 / 后 / 差异   原图 ({left},{top})',font=font,fill='black');offset=0
   for im in crops:panel.paste(im,(offset,35));offset+=im.width
   panels.append(panel)
  board=Image.new('RGB',(max(i.width for i in panels),sum(i.height for i in panels)), '#dddddd');y=0
  for im in panels:board.paste(im,(0,y));y+=im.height
  board.save(shots/(name+'-diff-3x.png'))
 if name!='05-first-screen':Image.open(after).save(shots/(name+'.png'))
(out/'evidence/pixel-comparison.json').write_text(json.dumps(checks,indent=2))
# Before/after first-screen overview, full screenshots remain unscaled separately.
a=Image.open(pairs[0][1]).convert('RGB');b=Image.open(pairs[0][2]).convert('RGB');a.thumbnail((1200,900));b.thumbnail((1200,900));board=Image.new('RGB',(2400,max(a.height,b.height)+45),'white');board.paste(a,(0,45));board.paste(b,(1200,45));d=ImageDraw.Draw(board);d.text((20,10),'首屏：接入前',font=font,fill='black');d.text((1220,10),'首屏：接入后',font=font,fill='black');board.save(shots/'first-screen-comparison.png')
# B8 annotated 1:1 world crop at DPR2, all source layout numbers retained.
g=json.loads((out/'evidence/geometry-final.json').read_text());layout=json.loads(pathlib.Path('src/render/world-v4-layout.json').read_text());im=Image.open(shots/'fixed-after/01-world-full.png').crop((2100*2,1250*2,2900*2,1850*2)).convert('RGB');d=ImageDraw.Draw(im)
def pos(p):return ((p[0]-2100)*2,(p[1]-1250)*2)
poly=[pos((x+342,y+200)) for x,y in layout['collision_px']['blocked']['array']['poly_px']];d.line(poly+[poly[0]],fill='#ffb000',width=5)
for old,new in zip(g['seats'],g['runtimeSeats']):
 x,y=pos(old['original']);d.ellipse((x-10,y-10,x+10,y+10),fill='#ff4444');d.text((x+15,y),old['id']+' 原',font=font,fill='#ff4444')
 x,y=pos(new['point']);d.ellipse((x-10,y-10,x+10,y+10),fill='#00ff90');d.text((x+15,y-30),new['id']+' 新',font=font,fill='#00c060');d.line([(x,y),(x+new['facing'][0]*70,y+new['facing'][1]*70)],fill='#00ff90',width=5)
d.rectangle((0,0,1600,48),fill='#ffffff');d.text((15,10),'B8：橙线=阵法碰撞；红点=原座位；绿点=运行时座位与朝向',font=font,fill='#222222');im.save(shots/'b8-seats.png')
Image.open(shots/'occlusion-railing-proof.png').save(shots/'04-occlusion-railing-proof.png')
print(json.dumps(checks,indent=2))
