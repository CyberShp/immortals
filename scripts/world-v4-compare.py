from PIL import Image,ImageChops
import numpy as np,json,os,sys
root=sys.argv[1] if len(sys.argv)>1 else '/Volumes/Media/immortal-qa/integration2/round2'
names=['01-world-full','02-gate-southbridge-closeup','03-east-bridge-platform','04-south-bridge-platform','05-first-screen']
results=[]
for name in names:
 before=root+'/before/shots/'+(name+'-before' if name=='05-first-screen' else name)+'.png'
 after=root+'/shots/'+(name+'-fixed-after' if name=='05-first-screen' else name)+'.png'
 if not os.path.exists(after):continue
 a=Image.open(before).convert('RGB');b=Image.open(after).convert('RGB')
 aa=np.asarray(a).astype(np.int16);bb=np.asarray(b).astype(np.int16);d=np.abs(aa-bb);sq=np.mean(d.astype(float)**2)
 m=d.max(2);r={'name':name,'differentPixels':int((m>0).sum()),'pixels':int(m.size),'max':int(d.max()),'mean':float(d.mean()),'psnr':float(10*np.log10(65025/sq)) if sq else None,'over4':float((m>4).mean())}
 # Worst-error region and centre, no resampling in exported 3x crops.
 yy,xx=np.unravel_index(m.argmax(),m.shape)
 for label,(cx,cy) in [('worst',(xx,yy)),('centre',(a.width//2,a.height//2))]:
  x=max(0,min(a.width-320,cx-160));y=max(0,min(a.height-240,cy-120));box=(x,y,x+320,y+240)
  sheet=Image.new('RGB',(1920,720),'white');sheet.paste(a.crop(box).resize((960,720),Image.Resampling.NEAREST),(0,0));sheet.paste(b.crop(box).resize((960,720),Image.Resampling.NEAREST),(960,0));sheet.save(root+'/shots/'+name+'-'+label+'-3x.png')
  r[label+'Crop']=[int(x),int(y),320,240]
 Image.fromarray(np.minimum(d*16,255).astype('uint8')).save(root+'/shots/'+name+'-diff.png')
 results.append(r)
open(root+'/evidence/pixel-comparison.json','w').write(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
