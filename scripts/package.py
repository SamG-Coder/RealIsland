"""Build a real, self-contained source ZIP; source submodules are flattened."""
from pathlib import Path
import zipfile,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'RealIsland-source.zip'
if not (ROOT/'generated/kernels.json').is_file(): raise SystemExit('Build the CUDA kernels before packaging.')
files=[]
for p in sorted(ROOT.rglob('*')):
    if not p.is_file(): continue
    rel=p.relative_to(ROOT)
    if any(x in {'.git','node_modules','__pycache__','.build'} for x in rel.parts): continue
    if p.suffix=='.zip' or p.name=='RealIsland-source.sha256': continue
    if 'vendor/realgrass/vendor/cuda-webshader/' in str(rel):
        remainder=str(rel).split('vendor/realgrass/vendor/cuda-webshader/',1)[1]
        if not remainder.startswith('src/') and not remainder.startswith(('LICENSE','THIRD_PARTY','NOTICE')): continue
    files.append(p)
with zipfile.ZipFile(OUT,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in files:z.write(p,'RealIsland/'+str(p.relative_to(ROOT)))
with zipfile.ZipFile(OUT) as z:
    bad=z.testzip()
    if bad:raise RuntimeError('Archive integrity failure: '+bad)
sha=hashlib.sha256(OUT.read_bytes()).hexdigest()
(ROOT/'RealIsland-source.sha256').write_text(sha+'  RealIsland-source.zip\n')
print(json.dumps({'archive':str(OUT),'bytes':OUT.stat().st_size,'files':len(files),'sha256':sha,'integrity':'passed'},indent=2))
