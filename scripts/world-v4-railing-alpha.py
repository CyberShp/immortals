"""Deterministic source-alpha overlap, independent of screenshot colours."""
import json, pathlib, numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, distance_transform_edt
from scipy.signal import fftconvolve
root=pathlib.Path(__file__).resolve().parents[1]
out=pathlib.Path('/Volumes/Media/immortal-qa/integration2/evidence')
data=json.loads((out/'railing-walk-points.json').read_text())
scale=data['actorHeight']*(93.71/96)/169
# Pixel-centre sampling of the same 192px sprite with anchor (96,186).
x0,y0=-54,-105
xs=(np.arange(109)+x0+.5)/scale+96-.5
ys=(np.arange(110)+y0+.5)/scale+186-.5
gy,gx=np.meshgrid(ys,xs,indexing='ij')
frames=[]
for gender in ['m','f']:
 for k in range(1,5):
  file=f'cool/frames/{gender}-stand-{k}.webp'
  alpha=np.array(Image.open(root/'public/assets'/file).convert('RGBA'))[:,:,3]/255.
  mask=map_coordinates(alpha,[gy,gx],order=1,mode='constant',cval=0)
  for flip in [1,-1]: frames.append((file,flip,mask if flip==1 else mask[:,::-1]))
results=[]
for rail in data['rails']:
 full=np.array(Image.open(root/'public/assets/world-v4/fg'/rail['file'].replace('.png','.webp')).convert('RGBA'))[:,:,3]/255.
 bx,by,bx1,by1=rail['bbox']; alpha=full[by-200:by1-200,bx-342:bx1-342]
 points=np.array(rail['points'],dtype=int)
 maxrow=None;nearest=None
 # Correlation padded such that index = foot - (bbox origin + kernel origin).
 for file,flip,mask in frames:
  corr=fftconvolve(alpha,mask[::-1,::-1],mode='full')/mask.sum()
  ix=points[:,0]+x0-bx+mask.shape[1]-1; iy=points[:,1]+y0-by+mask.shape[0]-1
  valid=(ix>=0)&(ix<corr.shape[1])&(iy>=0)&(iy<corr.shape[0])&(points[:,1]<rail['baseline'])
  ids=np.flatnonzero(valid)
  if len(ids):
   j=ids[np.argmax(corr[iy[ids],ix[ids]])];ratio=max(0,float(corr[iy[j],ix[j]]))
   if maxrow is None or ratio>maxrow['ratio']:maxrow={'point':points[j].tolist(),'ratio':ratio,'frame':file,'flip':flip,'baselineGreaterThanFoot':True}
 # Nearest walkable foot to alpha support (not merely bounding box).
 canvas=np.zeros((alpha.shape[0]+600,alpha.shape[1]+600),bool);canvas[300:300+alpha.shape[0],300:300+alpha.shape[1]]=alpha>0
 dist=distance_transform_edt(~canvas)
 ix=np.clip(points[:,0]-bx+300,0,canvas.shape[1]-1);iy=np.clip(points[:,1]-by+300,0,canvas.shape[0]-1)
 j=np.argmin(dist[iy,ix]);p=points[j];nearest={'point':p.tolist(),'distanceToAlphaPx':float(dist[iy[j],ix[j]])}
 x1,y1=p+[x0,y0];a=max(bx,x1);b=max(by,y1);c=min(bx1,x1+109);d=min(by1,y1+110)
 nearest['spriteRectangleOverlapAlphaPixels']=int(np.count_nonzero(alpha[b-by:d-by,a-bx:c-bx])) if c>a and d>b else 0
 results.append({k:v for k,v in rail.items() if k!='points'}|{'walkableFeet':len(points),'nearest':nearest,'maximumOcclusion':maxrow})
result={'method':'integer-pixel exhaustive feet; 8 standing frames and both flips; bilinear alpha; sum(actorAlpha*railAlpha)/sum(actorAlpha); baseline strictly greater than foot; contact shadows excluded','scale':scale,'results':results,'best':max(results,key=lambda r:r['maximumOcclusion']['ratio'] if r['maximumOcclusion'] else -1)}
(out/'railing-alpha.json').write_text(json.dumps(result,indent=2,ensure_ascii=False))
print(json.dumps(result['best'],ensure_ascii=False,indent=2))
proof_path=out/'railing-browser.json'
if proof_path.exists():
 proof=json.loads(proof_path.read_text());s=proof['stats'];rail=proof['rail'];bx,by,bx1,by1=rail['bbox']
 alpha=np.array(Image.open(root/'public/assets/world-v4/fg'/rail['file'].replace('.png','.webp')).convert('RGBA'))[:,:,3]/255.
 mask=next(m for f,flip,m in frames if f==s['frame'] and flip==s['frameFlip'])
 xx=np.arange(mask.shape[1])+x0+int(s['x'])-342;yy=np.arange(mask.shape[0])+y0+int(s['y'])-200
 weights=alpha[np.ix_(yy,xx)]
 actual={'frame':s['frame'],'flip':s['frameFlip'],'point':[s['x'],s['y']],'footZ':s['z'],'rail':rail['file'],'railZ':rail['baseline'],'actorAlpha':s['alpha'],'ratio':float((mask*weights).sum()/mask.sum()),'actorAlphaArea':float(mask.sum()),'occludedAlphaArea':float((mask*weights).sum()),'method':result['method']}
 assert actual['ratio']>=.15 and s['z']<rail['baseline'] and s['alpha']==1
 (out/'railing-actual-frame.json').write_text(json.dumps(actual,indent=2,ensure_ascii=False))
 print(json.dumps(actual,indent=2,ensure_ascii=False))
