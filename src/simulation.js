import {CoastalPatch} from './coastal-patch.js';
import {GpuRuntime} from '../vendor/realgrass/vendor/cuda-webshader/src/runtime/runtime.js';
import {gridFor} from './quality.js';
import {auditWatershed} from './watershed-audit.js';
import {headwaterBudget} from './hydrology.js';
export const SPRAY_COUNT=3584, ROCK_COUNT=105;
export class IslandSimulation {
  static async create(quality, seed, progress=()=>{}, onError=console.error) {
    if(!navigator.gpu) throw Error('WebGPU is unavailable. Open localhost or HTTPS in a WebGPU-enabled browser.');
    const runtime=await GpuRuntime.create({uniformCapacity:262144,onError});
    const response=await fetch(new URL('../generated/kernels.json',import.meta.url));
    if(!response.ok) throw Error('Missing compiled kernels. Run npm run build:kernels.');
    const artifacts=await response.json(), kernels={};
    let index=0;
    // Driver pipeline compilation is deliberately bounded, not 25 giant parallel jobs.
    for(const [name,artifact] of Object.entries(artifacts)) {
      progress(`Preparing ${name}`, .05+.28*index++/Object.keys(artifacts).length);
      kernels[name]=await runtime.kernel(artifact);
    }
    const sim=new IslandSimulation(runtime,kernels,quality,seed);
    await sim.initialize(progress);
    sim.coast=await CoastalPatch.create(sim,progress);
    for(let block=0;block<60;block++){
      const batch=runtime.batch();for(let i=0;i<40;i++)sim.step(batch);
      sim.coast.publish(batch);batch.submit();await runtime.idle();
      if(block%6===0)progress('Settling connected coastal surf',.60+.01*block/60);
    }
    const batch=runtime.batch();sim.publish(batch);batch.submit();await runtime.idle();return sim;
  }
  constructor(runtime,kernels,quality,seed=1741) {
    this.runtime=runtime;this.device=runtime.device;this.kernels=kernels;this.quality=quality;this.seed=seed;
    this.grid=gridFor(quality);this.n=this.grid.nx*this.grid.nz;this.count=quality.grass;this.treeCount=quality.trees;
    this.time=0;this.steps=0;this.debt=0;this.droppedTime=0;this.bindings=new Map();
    this.settings={flow:1,strength:1,wind:1.2,tide:0,clouds:.52,season:.75,moisture:.65};
    const buffer=(name,size,usage)=>this[name]=runtime.createBuffer(size,{label:`RealIsland ${name}`,...(usage?{usage}: {})});
    buffer('World',new Float32Array([seed,0]));buffer('S',this.n*19*4);buffer('Aux',this.n*4*4);buffer('Eta',this.n*4);
    buffer('R',ROCK_COUNT*8*4);buffer('RockMesh',ROCK_COUNT*65*25*8*4);buffer('RockWet',ROCK_COUNT*4*4);
    buffer('Terrain',this.n*8*4);buffer('Trees',this.treeCount*4*4);buffer('Foliage',this.treeCount*192*4*8*4);
    buffer('Particles',SPRAY_COUNT*12*4);buffer('Spray',SPRAY_COUNT*8*4);
    buffer('Controls',new Float32Array([1,0,0]));buffer('ForestShade',this.n*4);
    const waves=[];for(let i=0;i<8;i++){const a=[-.24,.42,-.67,.16,-.93,.72,-.38,.95][i],k=2*Math.PI/(8.5*.79**i);waves.push(k*Math.cos(a),k*Math.sin(a),Math.sqrt(9.81*k),.043*.77**i);}
    buffer('DetailW',new Float32Array(waves));
    for(const key of ['roots','shape','state','biology'])buffer(key,this.count*16);
    buffer('visible',this.count*16);buffer('commands',64,GPUBufferUsage.INDIRECT);
    this.lastControls='';this.growthKey='';this.nearGrass=true;
  }
  values(extra={}) {return {...this.grid,n:this.count,start:0,count:this.n,rockIndex:0,dt:1/120,enhanced:1,time:this.time,flow:this.settings.flow,closed:0,seed:this.seed,reset:0,season:this.settings.season,water:this.settings.moisture,...extra};}
  dispatch(batch,name,extra={},count=this.n) {
    const kernel=this.kernels[name], values=this.values(extra);
    const scalars=Object.fromEntries(kernel.artifact.metadata.scalars.map(s=>[s.name,values[s.name]]));
    let binding=this.bindings.get(name);
    if(!binding){binding=kernel.bind(Object.fromEntries(kernel.artifact.metadata.bindings.map(b=>[b.name,this[b.name]])),scalars);this.bindings.set(name,binding);}
    else binding.setScalars(scalars);
    batch.dispatch(binding,[Math.ceil(count/(name==='clearDraws'?16:128)),1,1]);
  }
  async initialize(progress) {
    const jobs=[];
    const add=(entry,count,extra={},split=false)=>{for(let start=0;start<count;start+=split?4096:count)jobs.push({entry,count:Math.min(split?4096:count,count-start),extra:{...extra,...(split?{start}: {})}});};
    add('initializeIsland',this.n,{},true);add('initializeRocks',ROCK_COUNT,{count:ROCK_COUNT});for(let rockIndex=0;rockIndex<ROCK_COUNT;rockIndex++)add('applyIslandRocks',4096,{rockIndex});
    add('islandTerrain',this.n,{},true);add('rockWetness',ROCK_COUNT,{reset:1});
    add('rockVertices',ROCK_COUNT*65*25,{count:ROCK_COUNT*65*25},true);
    add('treeInstances',this.treeCount,{count:this.treeCount});add('foliageVertices',this.treeCount*192*4,{count:this.treeCount*192*4},true);
    // Generation is bounded by GPU completion. Long terrain work cannot flood the queue.
    for(let i=0;i<jobs.length;i+=8){const batch=this.runtime.batch();for(const job of jobs.slice(i,i+8))this.dispatch(batch,job.entry,job.extra,job.count);batch.submit();await this.runtime.idle();progress('Growing the island on the GPU',.33+.20*(i+8)/jobs.length);}
    // One explicit startup readback measures the generated catchment. No evolving
    // field is read back during ordinary animation.
    const initialState=await this.runtime.read(this.S);
    this.hydrology=headwaterBudget(initialState,this.grid);
    // Reuse the existing startup readback for static character collision.
    this.collisionData={bed:initialState.slice(0,this.n),ground:initialState.slice(this.n,2*this.n),depth:initialState.slice(2*this.n,3*this.n)};
    const forest=await this.runtime.read(this.Trees);this.treeDescriptors=forest;const shade=new Float32Array(this.n).fill(1),g=this.grid;
    for(let t=0;t<this.treeCount;t++){
      const x=forest[t*4],z=forest[t*4+2],h=forest[t*4+3];if(h<1)continue;
      const cx=x+.48/.71*h*.4,cz=z+.51/.71*h*.4,r=h*.28+2;
      for(let j=Math.max(0,Math.floor((cz-r-g.z0)/g.dz));j<=Math.min(g.nz-1,Math.ceil((cz+r-g.z0)/g.dz));j++)
       for(let i=Math.max(0,Math.floor((cx-r-g.x0)/g.dx));i<=Math.min(g.nx-1,Math.ceil((cx+r-g.x0)/g.dx));i++){
        const d=((g.x0+i*g.dx-cx)/r)**2+((g.z0+j*g.dz-cz)/r)**2;if(d>1)continue;
        const k=j*g.nx+i;shade[k]=Math.max(.30,shade[k]*(1-.5*Math.exp(-d*3)));
       }
    }
    this.runtime.write(this.ForestShade,shade);

    this.syncControls();
    for(let block=0;block<8;block++){const batch=this.runtime.batch();for(let s=0;s<4;s++)this.step(batch);batch.submit();await this.runtime.idle();progress('Settling spring and ocean boundaries',.53+.07*(block+1)/8);}
    const batch=this.runtime.batch();this.publish(batch);batch.submit();await this.runtime.idle();
    this.initialDataBytes=this.runtime.stats.dataBytesUploaded;
  }
  syncControls() {
    const value=[this.settings.strength,this.hydrology?.sourceDepthRate||0,this.settings.tide],key=value.join(',');
    if(key!==this.lastControls){this.runtime.write(this.Controls,new Float32Array(value));this.lastControls=key;}
  }
  step(batch,closed=false) {
    this.time+=1/120;this.steps++;
    for(const name of ['advectMomentum','faces','limits','limitFlux','integrate','islandBoundary'])this.dispatch(batch,name,{closed:closed?1:0});
    if(!closed)this.coast?.step(batch);
    if(!closed&&this.steps%4===0){this.dispatch(batch,'transport',{dt:1/30});this.dispatch(batch,'commitTransport');this.dispatch(batch,'riverFoam',{dt:1/30});}
  }
  publish(batch) {
    this.coast?.publish(batch);
    this.dispatch(batch,'rockWetness',{reset:0},ROCK_COUNT);
    this.dispatch(batch,'reconstruct');this.dispatch(batch,'reconstructRiver');this.dispatch(batch,'surfaceDetail');
    this.dispatch(batch,'waterfallSpray',{count:SPRAY_COUNT},SPRAY_COUNT);
  }
  frame(dt,paused,camera,basis,aspect) {
    this.syncControls();const batch=this.runtime.batch();
    this.coast.follow(batch,camera,basis);
    if(!paused){this.debt+=Math.min(dt,.06);let s=0;while(this.debt>=1/120&&s<this.quality.maxSteps){this.step(batch);this.debt-=1/120;s++;}
      if(this.debt>1/30){this.droppedTime+=this.debt-1/30;this.debt=1/30;}this.publish(batch);}
    const originX=Math.floor(camera.x/6)-8,originZ=Math.floor(camera.z/6)-8;
    const key=`${originX},${originZ},${this.settings.season},${this.settings.moisture}`;
    if(key!==this.growthKey){this.dispatch(batch,'grow',{originX,originZ,reset:this.growthKey.split(',').slice(2).join(',')!==key.split(',').slice(2).join(',')?1:0},this.count);this.growthKey=key;}
    if(!paused)this.dispatch(batch,'simulate',{dt:Math.min(dt,1/30),wind:this.settings.wind,stiffness:.65,brushX:camera.x,brushZ:camera.z,brushForce:0,eyeX:camera.x,eyeZ:camera.z,clouds:this.settings.clouds},this.count);
    this.dispatch(batch,'clearDraws',{},16);
    this.dispatch(batch,'selectGrass',{eyeX:camera.x,eyeY:camera.y,eyeZ:camera.z,fx:basis.forward[0],fy:basis.forward[1],fz:basis.forward[2],rx:basis.right[0],rz:basis.right[2],ux:basis.up[0],uy:basis.up[1],uz:basis.up[2],aspect,height:1,inspect:0},this.count);
    batch.submit();
  }
  async watershedAudit() {
    await this.runtime.idle();
    return auditWatershed(await this.runtime.read(this.S),this.grid);
  }
  async diagnostics() {
    await this.runtime.idle();
    const [s,eta,roots,shape,commands]=await Promise.all([this.runtime.read(this.S),this.runtime.read(this.Eta),this.runtime.read(this.roots),this.runtime.read(this.shape),this.runtime.read(this.commands,Uint32Array)]);
    let nonfinite=0,minDepth=Infinity,maxDepth=0,volume=0,foam=0,wetCells=0,activeGrass=0,submergedRoots=0;
    for(const v of s)if(!Number.isFinite(v))nonfinite++;
    for(const v of eta)if(!Number.isFinite(v))nonfinite++;
    for(let k=0;k<this.n;k++){let h=s[2*this.n+k];minDepth=Math.min(minDepth,h);maxDepth=Math.max(maxDepth,h);volume+=h*this.grid.dx*this.grid.dz;foam+=s[5*this.n+k];if(h>.002)wetCells++;}
    for(let k=0;k<this.count;k++)if(shape[k*4]>0){activeGrass++;let i=Math.max(0,Math.min(this.grid.nx-1,Math.round((roots[k*4]-this.grid.x0)/this.grid.dx))),j=Math.max(0,Math.min(this.grid.nz-1,Math.round((roots[k*4+2]-this.grid.z0)/this.grid.dz))),q=j*this.grid.nx+i;if(s[2*this.n+q]>.08&&roots[k*4+1]<s[q]+s[2*this.n+q]-.05)submergedRoots++;}
    return {grid:this.grid,hydrology:this.hydrology,simulatedTime:this.time,steps:this.steps,nonfinite,minDepth,maxDepth,volume,foam,wetCells,activeGrass,submergedRoots,draws:Array.from(commands),runtime:{...this.runtime.stats},adapter:this.runtime.describe()};
  }
  async closedTests() {
    // Separate small scratch domain, using the EXACT SAME compiled FV pipelines.
    // Never reset or read back the live simulation as part of ordinary drawing.
    const rt=this.runtime,nx=65,nz=65,n=nx*nz,dx=.5,dz=.5;
    const S=rt.createBuffer(n*19*4),Aux=rt.createBuffer(n*4*4),bindings={};
    const run=(batch,name,mode=0)=>{
      const kernel=this.kernels[name],values={nx,nz,dx,dz,x0:0,z0:0,dt:1/120,time:0,flow:0,closed:1,enhanced:1,mode};
      const scalar=Object.fromEntries(kernel.artifact.metadata.scalars.map(s=>[s.name,values[s.name]]));
      if(!bindings[name])bindings[name]=kernel.bind(Object.fromEntries(kernel.artifact.metadata.bindings.map(b=>[b.name,b.name==='S'?S:b.name==='Aux'?Aux:this[b.name]])),scalar);else bindings[name].setScalars(scalar);
      batch.dispatch(bindings[name],[Math.ceil(n/128),1,1]);
    };
    const results=[];
    try {for(const mode of [0,1]){
      let batch=rt.batch();batch.clear(S);batch.clear(Aux);run(batch,'initializeClosedTest',mode);batch.submit();
      const before=await rt.read(S);const initialVolume=before.slice(2*n,3*n).reduce((a,b)=>a+b,0)*dx*dz;
      for(let chunk=0;chunk<8;chunk++){batch=rt.batch();for(let step=0;step<30;step++)for(const name of ['advectMomentum','faces','limits','limitFlux','integrate','islandBoundary'])run(batch,name);batch.submit();await rt.idle();}
      const after=await rt.read(S);const finalVolume=after.slice(2*n,3*n).reduce((a,b)=>a+b,0)*dx*dz;
      let nonfinite=0,maxDelta=0,minDepth=Infinity;for(let k=0;k<n;k++){if(!Number.isFinite(after[2*n+k]))nonfinite++;maxDelta=Math.max(maxDelta,Math.abs(after[2*n+k]-before[2*n+k]));minDepth=Math.min(minDepth,after[2*n+k]);}
      const relativeVolumeError=Math.abs(finalVolume-initialVolume)/initialVolume;
      results.push({test:mode===0?'closed wave propagation':'lake at rest',seconds:2,initialVolume,finalVolume,relativeVolumeError,maxDepthChange:maxDelta,minDepth,nonfinite,pass:nonfinite===0&&minDepth>=0&&relativeVolumeError<1e-5&&(mode===0?maxDelta>.001:maxDelta<2e-5)});
    }}finally{rt.destroyBuffer(S);rt.destroyBuffer(Aux);}
    return results;
  }
}
