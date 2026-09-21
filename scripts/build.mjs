import {cp,mkdir,rm,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import './build-kernels.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const file of ['index.html','favicon.svg','src','generated','kernels'])await cp(path.join(root,file),path.join(dist,file),{recursive:true});
for(const file of ['vendor/realgrass/src','vendor/realgrass/vendor/cuda-webshader/src'])await cp(path.join(root,file),path.join(dist,file),{recursive:true});
await mkdir(path.join(dist,'licenses'),{recursive:true});
for(const [source,name] of [['vendor/coast/LICENSE','Saltreach-LICENSE.txt'],['vendor/river/LICENSE','MountainRiver-LICENSE.txt'],['vendor/realgrass/vendor/cuda-webshader/LICENSE','cuda-webshader-LICENSE.txt']])await cp(path.join(root,source),path.join(dist,'licenses',name));
for(const name of ['CREDITS.md','sources.lock.json'])try{await cp(path.join(root,name),path.join(dist,name));}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(path.join(dist,'.nojekyll'),'');console.log('Built self-contained static dist/ (no CDN assets).');
