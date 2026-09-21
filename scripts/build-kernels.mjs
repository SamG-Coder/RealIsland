import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compile} from '../vendor/realgrass/vendor/cuda-webshader/src/compiler/compiler.js';
import {assembleSources} from '../src/source-assembly.js';
const root=new URL('../',import.meta.url);
const paths={coast:'vendor/coast/src/coastal-kernels.cu',coastRender:'vendor/coast/src/coastal-render.cu',river:'vendor/river/src/river.cu',impacts:'vendor/river/src/impacts.cu',grass:'vendor/realgrass/kernels/grass.cu',plant:'vendor/realgrass/kernels/plant-model.cuh',island:'kernels/island.cu'};
const inputs=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([k,p])=>[k,await readFile(new URL(p,root),'utf8')])));
const {source,grassSource}=assembleSources(inputs);
await mkdir(new URL('generated/',root),{recursive:true});
await writeFile(new URL('generated/island-linked.cu',root),source);
await writeFile(new URL('generated/meadow-linked.cu',root),grassSource);
const hydro=['initializeRocks','initializeIsland','islandTerrain','advectMomentum','faces','limits','limitFlux','integrate','islandBoundary','transport','commitTransport','riverFoam','reconstruct','reconstructRiver','surfaceDetail','rockVertices','treeInstances','foliageVertices','rockWetness','waterfallSpray','initializeClosedTest'];
const meadow=['grow','simulate','selectGrass','clearDraws'];
const report={kind:'CUDA-to-WGSL compilation (not GPU execution)',sources:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[paths[k],createHash('sha256').update(v).digest('hex')])),kernels:[]};
const artifacts={};
for(const [text,names] of [[source,hydro],[grassSource,meadow]])for(const entry of names){
  const start=performance.now();
  const artifact=compile(text,{entry,workgroupSize:[entry==='clearDraws'?16:128,1,1]});
  // The runtime needs WGSL and binding metadata, not the megabyte-scale compiler AST.
  const {ast, kernel, ...deployArtifact}=artifact;
  artifacts[entry]=deployArtifact;
  report.kernels.push({entry,wgslLines:artifact.wgsl.split('\n').length,storageBindings:artifact.metadata.bindings.length,compileMs:Math.round((performance.now()-start)*100)/100});
  console.log('Compiled',entry,report.kernels.at(-1).wgslLines,'WGSL lines');
}
await writeFile(new URL('generated/kernels.json',root),JSON.stringify(artifacts));
await mkdir(new URL('reports/',root),{recursive:true});
await writeFile(new URL('reports/compile.json',root),JSON.stringify(report,null,2)+'\n');
console.log(`Compiled ${report.kernels.length} CUDA entry points. GPU validation is separate.`);
