// Static tree descriptors stay on the GPU. Only camera uniforms are uploaded.
export const TREE_SEGMENTS=[12,4,2];
export class ForestVisibility {
 constructor(device,trees,count){
  this.device=device;this.count=count;
  const storage=GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST;
  this.views=[false,true].map(mirror=>({
   uniform:device.createBuffer({size:64,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),
   ids:device.createBuffer({label:'visible tree IDs '+mirror,size:count*3*4,usage:storage}),
   commands:device.createBuffer({label:'tree LOD draws '+mirror,size:60,usage:storage|GPUBufferUsage.INDIRECT})
  }));
  this.trees=trees.gpuBuffer||trees;
 }
 async initialize(){
  const module=this.device.createShaderModule({label:'forest bounds and distance detail',code:`
struct View {eye:vec4f,forward:vec4f,right:vec4f,up:vec4f}
struct Draw {indexCount:u32,instances:atomic<u32>,firstIndex:u32,baseVertex:i32,firstInstance:u32}
@group(0) @binding(0) var<uniform> camera:View;
@group(0) @binding(1) var<storage,read> trees:array<vec4f>;
@group(0) @binding(2) var<storage,read_write> visible:array<u32>;
@group(0) @binding(3) var<storage,read_write> draws:array<Draw>;
@compute @workgroup_size(128) fn selectTrees(@builtin(global_invocation_id) id:vec3u){
 let i=id.x;let count=arrayLength(&trees);if(i>=count){return;}
 let tree=trees[i];if(tree.w<.1){return;}
 // Enclose crown spread, branch sag and wind; use separate reflected frustum.
 let radius=tree.w*.78+.5;let delta=tree.xyz+vec3f(0.,tree.w*.48,0.)-camera.eye.xyz;
 let depth=dot(delta,camera.forward.xyz);let tanY=camera.eye.w;let tanX=tanY*camera.forward.w;
 if(depth+radius<.05 || abs(dot(delta,camera.right.xyz))>depth*tanX+radius*sqrt(1.+tanX*tanX)
 || abs(dot(delta,camera.up.xyz))>depth*tanY+radius*sqrt(1.+tanY*tanY)){return;}
 let relative=length(delta)/max(tree.w,1.);
 let lod=select(select(0u,1u,relative>5.),2u,relative>18.);
 let slot=atomicAdd(&draws[lod].instances,1u);visible[lod*count+slot]=i;
}`});
  const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error(errors.map(m=>m.message).join('\n'));
  this.pipeline=await this.device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'selectTrees'}});
  for(const view of this.views)view.group=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[view.uniform,this.trees,view.ids,view.commands].map((buffer,binding)=>({binding,resource:{buffer}}))});
 }
 encode(encoder,camera,basis,tide,mirror){
  const view=this.views[mirror?1:0],flip=v=>[v[0],mirror?-v[1]:v[1],v[2]];
  this.device.queue.writeBuffer(view.uniform,0,new Float32Array([camera.x,mirror?2*tide-camera.y:camera.y,camera.z,Math.tan(Math.PI/6),...flip(basis.forward),this.aspect,...flip(basis.right),0,...flip(basis.up),0]));
  this.device.queue.writeBuffer(view.commands,0,new Uint32Array(TREE_SEGMENTS.flatMap(n=>[192*n*6,0,0,0,0])));
  const pass=encoder.beginComputePass({label:'cull forest '+mirror});pass.setPipeline(this.pipeline);pass.setBindGroup(0,view.group);pass.dispatchWorkgroups(Math.ceil(this.count/128));pass.end();
 }
}
