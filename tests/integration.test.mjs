import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assembleSources,replaceOnce} from '../src/source-assembly.js';
import {makeGridIndices,makeQuadIndices} from '../src/renderer.js';
import {gridFor,QUALITY} from '../src/quality.js';
const root=new URL('../',import.meta.url);
const text=async p=>readFile(new URL(p,root),'utf8');
const inputs=Object.fromEntries(await Promise.all(Object.entries({coast:'vendor/coast/src/coastal-kernels.cu',coastRender:'vendor/coast/src/coastal-render.cu',river:'vendor/river/src/river.cu',impacts:'vendor/river/src/impacts.cu',grass:'vendor/realgrass/kernels/grass.cu',plant:'vendor/realgrass/kernels/plant-model.cuh',island:'kernels/island.cu',watershed:'kernels/watershed.cuh'}).map(async([key,file])=>[key,await text(file)])));
const assembly=assembleSources(inputs);
test('Windows and Unix checkouts produce identical linked CUDA',()=>{
  const unix=Object.fromEntries(Object.entries(inputs).map(([key,value])=>[key,value.replace(/\r\n?/g,'\n')]));
  const windows=Object.fromEntries(Object.entries(unix).map(([key,value])=>[key,value.replaceAll('\n','\r\n')]));
  assert.deepEqual(assembleSources(windows),assembleSources(unix));
});
test('source adapters reject missing or ambiguous replacements',()=>{assert.throws(()=>replaceOnce('x','a','b'));assert.throws(()=>replaceOnce('aa','a','b'));assert.equal(replaceOnce('ab','a','c'),'cb');});
test('all upstream systems remain linked, not a replacement ray marcher',()=>{for(const name of ['advectMomentum','limitFlux','commitTransport','riverRock','reconstructRiver','waterfallSpray','shoreProfile'])assert.match(assembly.source,new RegExp('void '+name+'|float '+name));assert.match(assembly.grassSource,/PlantOrgan plant = describeOrgan/);assert.match(assembly.grassSource,/cloudGust/);});
test('connected river and sea share the parent grid boundary',()=>{assert.match(assembly.source,/void islandBoundary/);assert.match(assembly.source,/void initializeIsland/);assert.match(assembly.source,/Explicit spring discharge/);assert.match(assembly.source,/closed==0/);});
test('grass roots follow terrain and exclude actual water and rocks',()=>{assert.match(assembly.grassSource,/plant.root.y \+= ground/);assert.match(assembly.grassSource,/depth>\.025f/);assert.match(assembly.grassSource,/bed-ground>\.07f/);assert.match(assembly.grassSource,/float y=r.y\+s.x/);});
test('quality profiles keep the same domain and support finite 120Hz steps',()=>{for(const q of Object.values(QUALITY)){const g=gridFor(q);assert.equal(g.x0,-1600);assert.equal(g.z0,-1600);assert.equal(g.dx*(g.nx-1),3200);assert.ok(q.grass%256===0);assert.ok(g.nx*g.nz*19*4<128*1024*1024);assert.ok((Math.sqrt(9.81*25)+9)/120/g.dx<.3);}});
test('static grid topology is in bounds for all copies',()=>{const a=makeGridIndices(5,7,3);assert.equal(a.length,4*6*6*3);assert.equal(Math.max(...a),5*7*3-1);assert.ok(a.every(v=>v>=0&&v<105));});
test('all 34 precompiled CUDA entry points retain WGSL metadata',async()=>{const artifacts=JSON.parse(await text('generated/kernels.json'));assert.equal(Object.keys(artifacts).length,34);for(const a of Object.values(artifacts)){assert.ok(a.wgsl.includes('@compute'));assert.ok(a.metadata.bindings.length<=8);assert.equal(a.metadata.workgroupSize[1],1);}});
test('browser assets do not require external CDNs or native CUDA',async()=>{const main=await text('src/main.js'),html=await text('index.html');assert.doesNotMatch(main+html,/https?:\/\/|unpkg|jsdelivr|three\.js/);assert.match(html,/src="\.\/src\/main.js"/);});

test('branch-card indices cover both halves without a crossed diagonal',()=>{assert.deepEqual(Array.from(makeQuadIndices(2)),[0,1,2,0,2,3,4,5,6,4,6,7]);});
test('static rock and tree kernels use the shared terrain cache',()=>{assert.match(assembly.source,/void applyIslandRocks/);assert.match(assembly.source,/float cachedRock/);assert.match(assembly.source,/float cachedField/);});

test('finite-volume passes retain the original compensated arithmetic',async()=>{const a=JSON.parse(await text('generated/kernels.json'));for(const entry of ['faces','integrate','transport','advectMomentum'])assert.match(a[entry].wgsl,/residual/);assert.doesNotMatch(a.simulate.wgsl,/residual/);assert.doesNotMatch(a.initializeIsland.wgsl,/cw_f64/);});
