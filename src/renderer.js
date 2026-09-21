import * as shaders from './scene-shaders.js';
import {createSeededMaterials} from '../vendor/realgrass/src/materials.js';
import {ROCK_COUNT,TREE_COUNT,SPRAY_COUNT} from './simulation.js';

export function makeGridIndices(cols,rows,copies=1) {
  const per=(cols-1)*(rows-1)*6,out=new Uint32Array(per*copies);let p=0;
  for(let copy=0;copy<copies;copy++)for(let z=0;z<rows-1;z++)for(let x=0;x<cols-1;x++){
    const a=copy*cols*rows+z*cols+x,b=a+1,c=a+cols,d=c+1;
    out[p++]=a;out[p++]=c;out[p++]=b;out[p++]=b;out[p++]=c;out[p++]=d;
  }
  return out;
}
export function makeQuadIndices(count) {
  const out=new Uint32Array(count*6);
  for(let i=0;i<count;i++)out.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);
  return out;
}
export class IslandRenderer {
  static async create(canvas,simulation,progress=()=>{}) {
    const renderer=new IslandRenderer(canvas,simulation);
    await renderer.initialize(progress);return renderer;
  }
  constructor(canvas,simulation) {
    this.canvas=canvas;this.sim=simulation;this.device=simulation.device;this.q=simulation.quality;
    this.context=canvas.getContext('webgpu');this.format=navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({device:this.device,format:this.format,alphaMode:'opaque'});
    this.scale=this.q.scale;this.exposure=1.08;this.width=0;this.height=0;
    this.lastWeather=-Infinity;this.lastMirror=-Infinity;this.compilation=[];this.pipelines={};this.frameCount=0;
  }
  buffer(label,size,usage=GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST){return this.device.createBuffer({label,size,usage});}
  texture(label,w,h,format='rgba16float') {
    const texture=this.device.createTexture({label,size:[w,h],format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});
    return {texture,view:texture.createView(),width:w,height:h};
  }
  async initialize(progress) {
    const d=this.device,V=GPUShaderStage.VERTEX,F=GPUShaderStage.FRAGMENT;
    this.camera=this.buffer('main camera',112);this.mirrorCamera=this.buffer('mirror camera',112);this.island=this.buffer('island parameters',64);this.postUniform=this.buffer('exposure',16);
    this.dummyBuffer=this.buffer('unused storage binding',256,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST);
    this.sampler=d.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
    this.dummyColor=this.texture('unused color',1,1,'rgba8unorm');d.queue.writeTexture({texture:this.dummyColor.texture},new Uint8Array([255,255,255,255]),{bytesPerRow:4},[1,1]);
    this.dummyDepth=this.texture('unused depth',1,1,'depth32float');
    this.environment=this.texture('RealGrass cloud environment',this.q.envWidth,this.q.envHeight);
    this.light=this.texture('cached cloud and terrain sunlight',this.q.light,this.q.light);
    const entries=[{binding:0,visibility:V|F,buffer:{type:'uniform'}}];
    for(let binding=1;binding<=5;binding++)entries.push({binding,visibility:V,buffer:{type:'read-only-storage'}});
    entries.push({binding:6,visibility:V|F,sampler:{type:'filtering'}},
      {binding:7,visibility:V|F,texture:{viewDimension:'2d-array'}},{binding:8,visibility:V|F,texture:{viewDimension:'2d-array'}},
      {binding:9,visibility:V|F,buffer:{type:'read-only-storage'}},{binding:10,visibility:V|F,buffer:{type:'uniform'}},
      {binding:11,visibility:V|F,buffer:{type:'read-only-storage'}},{binding:12,visibility:V|F,texture:{}},
      {binding:13,visibility:V,buffer:{type:'read-only-storage'}});
    this.worldLayout=d.createBindGroupLayout({label:'single-device island world',entries});
    this.imageLayout=d.createBindGroupLayout({label:'environment refraction reflection',entries:[
      {binding:0,visibility:V|F,texture:{}},{binding:1,visibility:F,texture:{}},{binding:2,visibility:F,texture:{sampleType:'depth'}},
      {binding:3,visibility:F,texture:{}},{binding:4,visibility:F,texture:{sampleType:'depth'}},{binding:5,visibility:V|F,sampler:{type:'filtering'}}]});
    this.layout=d.createPipelineLayout({bindGroupLayouts:[this.worldLayout,this.imageLayout]});
    progress('Generating original meadow materials',.61);this.materials=await createSeededMaterials(d,this.sim.seed);await d.queue.onSubmittedWorkDone();
    this.geometry={terrain:this.uploadIndices('terrain grid',makeGridIndices(this.sim.grid.nx,this.sim.grid.nz)),rocks:this.uploadIndices('rock topology',makeGridIndices(65,25,ROCK_COUNT)),foliage:this.uploadIndices('branch topology',makeQuadIndices(TREE_COUNT*96))};
    const alpha={color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}};
    const recipes=[
      ['environment',shaders.environmentShader(this.q.cloudSteps),'screenVs','environmentFs',false],
      ['light',shaders.lightShader,'screenVs','lightFs',false],['sky',shaders.skyShader,'screenVs','skyFs',true,{},false],
      ['terrain',shaders.terrainShader,'surfaceVs','terrainFs',true],['rocks',shaders.rockShader,'rockVs','rockFs',true],['foliage',shaders.foliageShader,'foliageVs','foliageFs',true],
      ['grass0',shaders.residentGrass,'vs','fs',true,{SEGMENTS:5}],['grass1',shaders.residentGrass,'vs','fs',true,{SEGMENTS:2}],['grass2',shaders.residentGrass,'vs','fs',true,{SEGMENTS:1}],
      ['seeds',shaders.residentGrass,'seedVs','seedFs',true],
      ['distant',shaders.distantMeadow(this.q.distant),'vs','fs',true,{CELL:1.5,INNER:24,OUTER:220,DIST_SEGMENTS:2,UNDERSTORY:false}],
      ['flowers',shaders.meadowFlowers(this.q.distant),'farFlowerVs','seedFs',true],
      ['water',shaders.waterShader,'waterVs','waterFs',true,{FAR:false},false],
      ['farWater',shaders.waterShader,'waterVs','waterFs',true,{FAR:true},false],
      ['spray',shaders.sprayShader,'sprayVs','sprayFs',true,{},false,alpha]
    ];
    const modules=new Map();
    for(let i=0;i<recipes.length;i++) {
      const [name,code,vertex,fragment,depth,constants={},depthWrite=true,blend]=recipes[i];
      progress(`Preparing ${name} rendering`,.63+.31*i/recipes.length);
      let module=modules.get(code);if(!module){module=await this.module(code,name);modules.set(code,module);}
      this.pipelines[name]=await d.createRenderPipelineAsync({label:name,layout:this.layout,vertex:{module,entryPoint:vertex,constants},fragment:{module,entryPoint:fragment,targets:[{format:'rgba16float',...(blend?{blend}:{})}]},primitive:{topology:'triangle-list',cullMode:'none'},...(depth?{depthStencil:{format:'depth32float',depthWriteEnabled:depthWrite,depthCompare:'less-equal'}}:{})});
    }
    const postModule=await this.module(shaders.postShader,'post processing');
    this.pipelines.post=await d.createRenderPipelineAsync({label:'tone map and edge filter',layout:'auto',vertex:{module:postModule,entryPoint:'screenVs'},fragment:{module:postModule,entryPoint:'postFs',targets:[{format:this.format}]},primitive:{topology:'triangle-list'}});
    this.groups={};
    for(const mirror of [false,true])for(const kind of ['terrain','rocks','foliage','spray','sky','grass0','grass1','grass2','seeds'])this.groups[(mirror?'m:':'')+kind]=this.worldGroup(kind,mirror);
    this.groups.light=this.worldGroup('sky',false,true);this.groups.environment=this.worldGroup('sky',false,true);
    this.safeImages=this.images();this.blankImages=this.images(true);
    this.resize();progress('Ready to explore',1);
  }
  async module(code,name) {
    const module=this.device.createShaderModule({label:name,code});const info=await module.getCompilationInfo();
    const errors=info.messages.filter(x=>x.type==='error');this.compilation.push({name,lines:code.split('\n').length,errors:errors.map(e=>({line:e.lineNum,message:e.message}))});
    if(errors.length)throw Error(`${name}:\n${errors.map(e=>`${e.lineNum}:${e.linePos} ${e.message}`).join('\n')}`);return module;
  }
  uploadIndices(label,array) {
    const buffer=this.buffer(label,array.byteLength,GPUBufferUsage.INDEX|GPUBufferUsage.COPY_DST);this.device.queue.writeBuffer(buffer,0,array);return {buffer,count:array.length};
  }
  worldGroup(kind,mirror=false,blankLight=false) {
    const s=this.sim,resource=r=>({buffer:r?.gpuBuffer||r||this.dummyBuffer});
    const binding=[1,2,3,4,5].map(b=>({binding:b,resource:resource(null)}));
    if(kind.startsWith('grass')||kind==='seeds'){
      binding[0].resource=resource(s.roots);binding[1].resource=resource(s.shape);binding[2].resource=resource(s.state);
      const slot=kind==='seeds'?3:Number(kind.slice(5));binding[3].resource={buffer:s.visible.gpuBuffer,offset:slot*s.count*4,size:s.count*4};binding[4].resource=resource(s.biology);
    }else if(kind==='rocks')binding[0].resource=resource(s.RockWet);
    const geometry={terrain:s.Terrain,rocks:s.RockMesh,foliage:s.Foliage,spray:s.Spray}[kind];
    return this.device.createBindGroup({layout:this.worldLayout,entries:[{binding:0,resource:{buffer:mirror?this.mirrorCamera:this.camera}},...binding,...this.materials.entries,
      {binding:9,resource:resource(s.S)},{binding:10,resource:{buffer:this.island}},{binding:11,resource:resource(s.Eta)},
      {binding:12,resource:(blankLight?this.dummyColor:this.light).view},{binding:13,resource:resource(geometry)}]});
  }
  images(blankEnvironment=false,water=false) {
    return this.device.createBindGroup({layout:this.imageLayout,entries:[
      {binding:0,resource:(blankEnvironment?this.dummyColor:this.environment).view},
      {binding:1,resource:water?this.opaque.view:this.dummyColor.view},{binding:2,resource:water?this.depth.view:this.dummyDepth.view},
      {binding:3,resource:water?this.mirror.view:this.dummyColor.view},{binding:4,resource:water?this.mirrorDepth.view:this.dummyDepth.view},
      {binding:5,resource:this.sampler}]});
  }
  resize() {
    const ratio=Math.min(devicePixelRatio||1,this.q.maxDpr)*this.scale;
    const width=Math.max(128,Math.round(this.canvas.clientWidth*ratio)),height=Math.max(96,Math.round(this.canvas.clientHeight*ratio));
    if(width===this.width&&height===this.height)return;
    this.width=width;this.height=height;this.canvas.width=width;this.canvas.height=height;
    for(const name of ['opaque','composite','depth','mirror','mirrorDepth'])this[name]?.texture.destroy();
    this.opaque=this.texture('opaque island',width,height);this.composite=this.texture('water composite',width,height);this.depth=this.texture('sampleable opaque depth',width,height,'depth32float');
    this.mirror=this.texture('planar reflection',Math.max(64,Math.round(width*.5)),Math.max(48,Math.round(height*.5)));this.mirrorDepth=this.texture('reflection depth',this.mirror.width,this.mirror.height,'depth32float');
    this.waterImages=this.images(false,true);
    this.postGroup=this.device.createBindGroup({layout:this.pipelines.post.getBindGroupLayout(0),entries:[{binding:0,resource:this.composite.view},{binding:1,resource:this.sampler},{binding:2,resource:{buffer:this.postUniform}}]});
    this.lastWeather=-Infinity;this.lastMirror=-Infinity;
  }
  cameraData(camera,basis,mirror=false) {
    const s=this.sim.settings,eye=[camera.x,mirror?2*s.tide-camera.y:camera.y,camera.z];
    const flip=v=>[v[0],mirror?-v[1]:v[1],v[2]];
    return new Float32Array([...eye,this.sim.time,...basis.right,this.width/this.height,...flip(basis.up),this.height,...flip(basis.forward),Math.tan(Math.PI/6),1,0,0,0,0,s.wind,this.sim.seed,s.clouds,s.season,s.moisture,0,mirror?1:0]);
  }
  drawOpaque(encoder,color,depth,mirror=false,grass=true) {
    const pass=encoder.beginRenderPass({label:mirror?'reflected island':'opaque island',colorAttachments:[{view:color.view,loadOp:'clear',storeOp:'store',clearValue:{r:.3,g:.45,b:.6,a:1}}],depthStencilAttachment:{view:depth.view,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});
    pass.setBindGroup(1,this.safeImages);
    const prefix=mirror?'m:':'';
    pass.setPipeline(this.pipelines.sky);pass.setBindGroup(0,this.groups[prefix+'sky']);pass.draw(3);
    for(const name of ['terrain','rocks','foliage']){pass.setPipeline(this.pipelines[name]);pass.setBindGroup(0,this.groups[prefix+name]);pass.setIndexBuffer(this.geometry[name].buffer,'uint32');pass.drawIndexed(this.geometry[name].count);}
    if(grass){for(let i=0;i<3;i++){pass.setPipeline(this.pipelines['grass'+i]);pass.setBindGroup(0,this.groups['grass'+i]);pass.drawIndirect(this.sim.commands.gpuBuffer,i*16);}
      pass.setPipeline(this.pipelines.seeds);pass.setBindGroup(0,this.groups.seeds);pass.drawIndirect(this.sim.commands.gpuBuffer,48);
      pass.setBindGroup(0,this.groups.grass0);pass.setPipeline(this.pipelines.distant);pass.draw(36,this.q.distant*this.q.distant);
      pass.setPipeline(this.pipelines.flowers);pass.draw(108,this.q.distant*this.q.distant);
    }
    pass.end();
  }
  frame(camera,basis,now) {
    this.resize();const d=this.device,g=this.sim.grid,s=this.sim.settings;
    d.queue.writeBuffer(this.camera,0,this.cameraData(camera,basis));d.queue.writeBuffer(this.mirrorCamera,0,this.cameraData(camera,basis,true));
    const data=new ArrayBuffer(64),f=new Float32Array(data),u=new Uint32Array(data);
    f.set([g.x0,g.z0,g.dx,g.dz]);u.set([g.nx,g.nz,this.q.reflection?1:0,0],4);f.set([s.tide,s.strength,s.wind,this.exposure],8);f.set([this.width,this.height,0,0],12);d.queue.writeBuffer(this.island,0,data);d.queue.writeBuffer(this.postUniform,0,new Float32Array([this.exposure,0,0,0]));
    const encoder=d.createCommandEncoder({label:'RealIsland frame'});
    if(now-this.lastWeather>.12){
      for(const name of ['environment','light']){const pass=encoder.beginRenderPass({label:name,colorAttachments:[{view:this[name].view,loadOp:'clear',storeOp:'store',clearValue:{r:1,g:1,b:1,a:1}}]});pass.setPipeline(this.pipelines[name]);pass.setBindGroup(0,this.groups[name]);pass.setBindGroup(1,this.blankImages);pass.draw(3);pass.end();}
      this.lastWeather=now;
    }
    if(this.q.reflection){this.drawOpaque(encoder,this.mirror,this.mirrorDepth,true,false);}
    else if(this.lastMirror===-Infinity){const pass=encoder.beginRenderPass({colorAttachments:[{view:this.mirror.view,loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}],depthStencilAttachment:{view:this.mirrorDepth.view,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'}});pass.end();}
    this.lastMirror=now;
    this.drawOpaque(encoder,this.opaque,this.depth,false,true);
    encoder.copyTextureToTexture({texture:this.opaque.texture},{texture:this.composite.texture},[this.width,this.height]);
    const water=encoder.beginRenderPass({label:'river, surf and far ocean',colorAttachments:[{view:this.composite.view,loadOp:'load',storeOp:'store'}],depthStencilAttachment:{view:this.depth.view,depthReadOnly:true}});
    water.setBindGroup(0,this.groups.terrain);water.setBindGroup(1,this.waterImages);water.setPipeline(this.pipelines.water);water.setIndexBuffer(this.geometry.terrain.buffer,'uint32');water.drawIndexed(this.geometry.terrain.count);
    water.setPipeline(this.pipelines.farWater);water.draw(4*32*32*6);
    water.setPipeline(this.pipelines.spray);water.setBindGroup(0,this.groups.spray);water.draw(6,SPRAY_COUNT);water.end();
    const post=encoder.beginRenderPass({label:'display',colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});post.setPipeline(this.pipelines.post);post.setBindGroup(0,this.postGroup);post.draw(3);post.end();
    d.queue.submit([encoder.finish()]);this.frameCount++;
  }
}
