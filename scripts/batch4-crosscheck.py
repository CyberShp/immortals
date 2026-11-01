"""Run the supplied reviewer port and compare the live TypeScript predicate on the same grid."""
import argparse, importlib.util, json, pathlib, subprocess, sys
import numpy as np
p=argparse.ArgumentParser()
p.add_argument('--review',required=True);p.add_argument('--validator',required=True);p.add_argument('--layout',required=True);p.add_argument('--spots',required=True);p.add_argument('--out-dir',required=True)
a=p.parse_args();out=pathlib.Path(a.out_dir);out.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(pathlib.Path(a.validator).parent))
spec=importlib.util.spec_from_file_location('crosscheck',a.review);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.vs.DEF_LAYOUT=a.layout;m.vs.DEF_SPOTS=a.spots;m.vs.HERE=str(out)
m.main()
(out/'crosscheck-review-port.md').write_bytes((out/'crosscheck_forge_walkable.md').read_bytes())
(out/'crosscheck-review-port.json').write_bytes((out/'crosscheck_forge_walkable.json').read_bytes())
old=json.loads((out/'crosscheck_forge_walkable.json').read_text())
grid={'us':np.arange(21.,54.5+1e-9,.05).tolist(),'vs':np.arange(-10.5,18.+1e-9,.05).tolist(),'points':[r['uv'] for r in old['points']]}
(out/'crosscheck-grid.json').write_text(json.dumps(grid))
subprocess.run(['node','--import','tsx','scripts/batch4-walkable-export.ts',str(out/'crosscheck-grid.json'),str(out/'crosscheck-live')],check=True)
live=json.loads((out/'crosscheck-live.json').read_text());mask=np.fromfile(out/'crosscheck-live.bin',dtype=np.uint8).astype(bool).reshape(len(grid['us']),len(grid['vs']))
lookup={tuple(round(v,9) for v in r['uv']):r['ok'] for r in live['points']}
def live_ok(fw,U,V):
    if U.ndim==2:return mask
    return np.array([lookup[(round(float(U[0]),9),round(float(V[0]),9))]])
m.forge_ok=live_ok
m.main()
res=json.loads((out/'crosscheck_forge_walkable.json').read_text())
res['implementation']='live TypeScript v4Walkable; reviewer port retained separately'
res['muster_current']=live['muster']
world=m.vs.World(json.load(open(a.layout,encoding='utf-8')))
current=res['points'][:12]+[dict(id=f'MUSTER_FINAL_{i+1}',uv=q,forge_port=True,wally=bool(world.ok_mask(np.array([q[0]]),np.array([q[1]]))[0][0])) for i,q in enumerate(live['musterUV'])]
res['current_points']=current
res['current_point_disagreements']=[p for p in current if p['forge_port'] != p['wally']]
(out/'crosscheck_forge_walkable.json').write_text(json.dumps(res,ensure_ascii=False,indent=2))

md=out/'crosscheck_forge_walkable.md'
md.write_text(md.read_text().replace('Forge 移植', 'Forge 实际 TypeScript').replace('Forge v4Walkable 移植', 'Forge v4Walkable 实际 TypeScript') + '\n本轮结果来自真实 src/render/world-v4.ts；旧移植结果另存 crosscheck-review-port.json/.md。\n')

with md.open('a') as f:f.write(f"\n现行12点+6席：不一致 {len(res['current_point_disagreements'])}/{len(current)}。\n")
