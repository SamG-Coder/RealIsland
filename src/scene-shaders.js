import {common as meadowCommon,grass,distantGrass,distantFlowers} from '../vendor/realgrass/src/shaders.js';

// Original plant/weather functions remain in the source. The flat-world camera
// and material hooks are adapted here, not replaced with a meadow lookalike.
const islandBindings=/* wgsl */`
struct Island { domain:vec4f, grid:vec4u, weather:vec4f, view:vec4f }
@group(0) @binding(9) var<storage,read> waterState:array<f32>;
@group(0) @binding(10) var<uniform> isle:Island;
@group(0) @binding(11) var<storage,read> waterEta:array<f32>;
@group(0) @binding(12) var groundLight:texture_2d<f32>;
@group(0) @binding(13) var<storage,read> geometry:array<vec4f>;
@group(1) @binding(0) var environment:texture_2d<f32>;
@group(1) @binding(1) var opaqueColor:texture_2d<f32>;
@group(1) @binding(2) var opaqueDepth:texture_depth_2d;
@group(1) @binding(3) var mirrorColor:texture_2d<f32>;
@group(1) @binding(4) var mirrorDepth:texture_depth_2d;
@group(1) @binding(5) var clampSampler:sampler;
fn gridPoint(p:vec2f)->vec2f{return clamp((p-isle.domain.xy)/isle.domain.zw,vec2f(0.),vec2f(isle.grid.xy)-1.001);}
fn inIslandGrid(p:vec2f)->bool {let q=(p-isle.domain.xy)/isle.domain.zw;return all(q>=vec2f(0.))&&all(q<=vec2f(isle.grid.xy)-1.);}
fn fieldAt(layer:u32,p:vec2f)->f32{
 let g=gridPoint(p);let i=vec2u(g);let f=fract(g);let n=isle.grid.x*isle.grid.y;let k=layer*n+i.y*isle.grid.x+i.x;
 return mix(mix(waterState[k],waterState[k+1u],f.x),mix(waterState[k+isle.grid.x],waterState[k+isle.grid.x+1u],f.x),f.y);
}
fn fieldGround(p:vec2f)->f32 {return fieldAt(1u,p);}
fn coverMask(p:vec2f)->f32 {
 if(!inIslandGrid(p)){return 0.;}
 let h=fieldGround(p);let slope=vec2f(fieldGround(p+vec2f(1.,0.))-fieldGround(p-vec2f(1.,0.)),fieldGround(p+vec2f(0.,1.))-fieldGround(p-vec2f(0.,1.)))*.5;
 return smoothstep(2.35,3.3,h)*(1.-smoothstep(.70,1.15,dot(slope,slope)))*(1.-smoothstep(.02,.055,fieldAt(2u,p)))*(1.-smoothstep(.02,.07,fieldAt(0u,p)-h));
}
fn lightAt(p:vec3f)->f32 {
 let uv=clamp((p.xz-isle.domain.xy)/(vec2f(isle.grid.xy)-1.)/isle.domain.zw,vec2f(.001),vec2f(.999));
 return textureSampleLevel(groundLight,clampSampler,uv,0.).r;
}
fn envSky(rd:vec3f)->vec3f {
 let uv=vec2f(atan2(rd.z,rd.x)/6.2831853+.5,1.-asin(clamp(rd.y,0.,1.))/1.5707963);
 return textureSampleLevel(environment,clampSampler,uv,0.).rgb;
}
fn aerial(c:vec3f,p:vec3f)->vec3f {
 let distance=length(p-cam.eye.xyz);
 let amount=1.-exp(-distance*.00072);
 return mix(c,vec3f(.38,.54,.65),amount);
}
`;
// Cache source cloud shadows in a world-space texture instead of running six
// volumetric samples per grass fragment. The generating pass still uses the
// original cloudSunlight/weatherDensity functions.
function adaptCommon(source){
 return source.replace('const SUN = vec3f(-0.48,0.71,-0.51);','const SUN = vec3f(-0.480096,0.710142,-0.510102);')
   .replace('let sunlight=cloudSunlight(p);','let sunlight=lightAt(p);') + islandBindings;
}
export const common=adaptCommon(meadowCommon);
const fullscreen=/* wgsl */`
struct Screen { @builtin(position) p:vec4f,@location(0) uv:vec2f }
@vertex fn screenVs(@builtin(vertex_index) i:u32)->Screen {
 let points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:Screen;
 o.p=vec4f(points[i],.9999999,1.);o.uv=points[i]*vec2f(.5,-.5)+.5;return o;
}
`;
export function environmentShader(steps=48){
 let source=common.replace('let step=(end-begin)/96.;',`let step=(end-begin)/${steps}.;`).replace('i<96u',`i<${steps}u`);
 return source+fullscreen+/* wgsl */`
 @fragment fn environmentFs(v:Screen)->@location(0) vec4f {
  let a=(v.uv.x-.5)*6.2831853;let h=(1.-v.uv.y)*1.5707963;
  let rd=vec3f(cos(a)*cos(h),sin(h),sin(a)*cos(h));
  return vec4f(sky(rd),1.);
 }`;
}
export const lightShader=common+fullscreen+/* wgsl */`
@fragment fn lightFs(v:Screen)->@location(0) vec4f {
 let xz=isle.domain.xy+v.uv*(vec2f(isle.grid.xy)-1.)*isle.domain.zw;
 let ground=fieldAt(0u,xz);let p=vec3f(xz.x,ground+.18,xz.y);
 var terrainShadow=1.;var distance=1.8;
 for(var i=0u;i<15u;i++){
   let q=p+SUN*distance;
   let separation=q.y-fieldAt(0u,q.xz);
   terrainShadow=min(terrainShadow,smoothstep(-.16,.45+distance*.006,separation));
   distance*=1.42;
 }
 let sunlight=cloudSunlight(p)*mix(.20,1.,terrainShadow);
 return vec4f(sunlight,sunlight,sunlight,1.);
}
`;
export const skyShader=common+fullscreen+/* wgsl */`
@fragment fn skyFs(v:Screen)->@location(0) vec4f {
 let uv=v.uv*vec2f(2.,-2.)+vec2f(-1.,1.);
 let rd=normalize(cam.forward.xyz+uv.x*cam.right.xyz*cam.forward.w*cam.right.w+uv.y*cam.up.xyz*cam.forward.w);
 var c=envSky(rd);
 if(rd.y<0.){c=mix(c,vec3f(.12,.24,.30),smoothstep(0.,.3,-rd.y));}
 return vec4f(c,1.);
}
`;
const surfaceVertex=/* wgsl */`
struct Surface { @builtin(position) p:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) data:vec4f,@location(3) uv:vec2f }
@vertex fn surfaceVs(@builtin(vertex_index) i:u32)->Surface {
 let a=geometry[i*2u];let b=geometry[i*2u+1u];var o:Surface;
 o.p=project(a.xyz);o.world=a.xyz;o.normal=normalize(b.xyz);o.data=vec4f(a.w,b.w,0.,0.);o.uv=vec2f(0.);return o;
}
fn mineral(p:vec3f,n:vec3f)->vec3f {
 let weights=pow(abs(n),vec3f(4.));let w=weights/max(dot(weights,vec3f(1.)),.001);
 let macro=fbm(p.yz*.034)*w.x+fbm(p.xz*.034)*w.y+fbm(p.xy*.034)*w.z;
 let mid=fbm(p.yz*.41)*w.x+fbm(p.xz*.41)*w.y+fbm(p.xy*.41)*w.z;
 let grain=noise(p.yz*2.4)*w.x+noise(p.xz*2.4)*w.y+noise(p.xy*2.4)*w.z;
 let cracks=1.-smoothstep(.014,.07,abs(mid-.49));
 let vein=(1.-smoothstep(.014,.035,abs(sin(dot(p,vec3f(.93,.70,-.52))+mid*.56))))*.065;
 return mix(vec3f(.19,.215,.205),vec3f(.49,.44,.35),macro)*mix(.68,1.25,mid)*mix(.87,1.1,grain)*(1.-cracks*.14)+vec3f(.65,.60,.47)*vein;
}
fn diffuseSurface(color:vec3f,n:vec3f,p:vec3f,wet:f32)->vec3f {
 let sunlight=lightAt(p);let ndl=max(dot(n,SUN),0.);
 let ambient=vec3f(.32,.40,.49)*(.66+.34*max(n.y,0.));
 let direct=vec3f(1.12,1.04,.84)*ndl*sunlight;
 let halfVector=normalize(SUN+normalize(cam.eye.xyz-p));
 let spec=pow(max(dot(n,halfVector),0.),mix(18.,90.,wet))*.22*wet*sunlight;
 return aerial(color*(ambient+direct)+vec3f(spec),p);
}
`;
export const terrainShader=common+surfaceVertex+/* wgsl */`
@fragment fn terrainFs(v:Surface)->@location(0) vec4f {
 let p=v.world;var n=normalize(v.normal);let distance=length(p-cam.eye.xyz);
 let footprint=max(length(dpdx(p.xz)),length(dpdy(p.xz)));
 let wet=fieldAt(7u,p.xz);let film=fieldAt(8u,p.xz);
 let ripples=sin(dot(p.xz,vec2f(2.3,.48))+noise(p.xz*.16)*4.);
 let grain=(noise(p.xz*55.)-.5)*(1.-smoothstep(.02,.15,footprint));
 let sand=mix(vec3f(.52,.44,.30),vec3f(.76,.68,.49),noise(p.xz*.12))*(1.+grain*.18+ripples*.022);
 let land=canopySurface(p,footprint)*.78;
 let vegetation=smoothstep(2.0,3.8,p.y)*smoothstep(.55,.83,n.y)*(1.-smoothstep(69.,87.,p.y));
 var base=mix(sand,land,vegetation);
 let rockiness=(1.-smoothstep(.49,.76,n.y))*smoothstep(3.,9.,p.y);
 base=mix(base,mineral(p,n),rockiness);
 base*=mix(1.,.49,clamp(wet+film*.22,0.,1.)*(1.-vegetation*.6));
 let detail=(noise(p.xz*6.)-.5)*(1.-smoothstep(35.,120.,distance));
 n=normalize(n+vec3f(detail*.14,0.,detail*.08));
 // Caustic detail follows actual shallow, unfoamed water.
 let depth=fieldAt(2u,p.xz);let foam=fieldAt(5u,p.xz);
 let caustic=pow(1.-abs(noise(p.xz*1.3+vec2f(cam.eye.w*.09,0.))+noise(p.xz*1.7-vec2f(0.,cam.eye.w*.12))-1.),22.)
 *smoothstep(.06,.24,depth)*(1.-smoothstep(2.,4.,depth))*(1.-foam)*.075;
 var color=diffuseSurface(base,n,p,wet)+vec3f(.60,.85,.70)*caustic;
 if(cam.growth.w>.5 && p.y<isle.weather.x-.02){discard;}
 return vec4f(color,1.);
}
`;
export const rockShader=common+surfaceVertex+/* wgsl */`
@group(0) @binding(1) var<storage,read> rockDamp:array<vec4f>;
@vertex fn rockVs(@builtin(vertex_index) i:u32)->Surface {
 let a=geometry[i*2u];let b=geometry[i*2u+1u];let damp=rockDamp[i/1625u];var o:Surface;
 o.p=project(a.xyz);o.world=a.xyz;o.normal=normalize(b.xyz);o.data=vec4f(a.w,b.w,damp.x,damp.y);o.uv=vec2f(0.);return o;
}
@fragment fn rockFs(v:Surface)->@location(0) vec4f {
 if(v.data.x<-.015 || (cam.growth.w>.5 && v.world.y<isle.weather.x-.02)){discard;}
 let p=v.world;let n=normalize(v.normal);let moss=smoothstep(.69,.93,n.y)*smoothstep(.43,.72,noise(p.xz*.47))*smoothstep(1.,4.,p.y);
 let wet=(1.-smoothstep(v.data.z-.03,v.data.z+.2,p.y))*v.data.w;
 var c=mix(mineral(p,n),vec3f(.15,.21,.074),moss*.74)*mix(1.,.49,wet);
 return vec4f(diffuseSurface(c,n,p,wet),1.);
}
`;
export const foliageShader=common+surfaceVertex+/* wgsl */`
@vertex fn foliageVs(@builtin(vertex_index) i:u32)->Surface {
 let a=geometry[i*2u];let b=geometry[i*2u+1u];let corner=i%4u;
 let uv=array<vec2f,4>(vec2f(0,-1),vec2f(1,-1),vec2f(1,1),vec2f(0,1));
 let wind=sin(a.x*.12+a.z*.09-cam.eye.w*1.3)*.18*cam.atmosphere.y;
 let world=a.xyz+vec3f(wind,0.,wind*.37)*uv[corner].x*b.w;
 var o:Surface;o.world=world;o.normal=normalize(b.xyz);o.p=project(world);o.uv=uv[corner];o.data=vec4f(a.w,b.w,0.,0.);return o;
}
@fragment fn foliageFs(v:Surface)->@location(0) vec4f {
 let u=v.uv.x;let across=abs(v.uv.y);let seed=v.data.x;
 let twigs=abs(fract(u*(9.+seed*7.)+across*1.35)-.5);
 let silhouette=pow(max(0.,1.-u),.4)*(0.57+.33*sin(u*44.+seed*19.)*sin(u*23.));
 if(across>silhouette || (twigs>.35 && across>.10) || (cam.growth.w>.5&&v.world.y<isle.weather.x)){discard;}
 let light=lightAt(v.world);let color=mix(vec3f(.045,.094,.037),vec3f(.16,.25,.074),seed)*(.8+u*.25);
 return vec4f(aerial(color*(.65+light*.65),v.world),1.);
}
`;
function adaptMeadow(source) {
 let s=source.replace(meadowCommon,common);
 s=s.replaceAll('vec3f(r.x,0.,r.z)-cam.eye.xyz','r.xyz-cam.eye.xyz').replaceAll('vec3f(r.x,r.y*cam.misc.x,r.z)','r.xyz');
 s=s.replace('let groundPoint=cam.eye.xyz+ray*(-cam.eye.y/min(ray.y,-0.0001));','let groundPoint=vec3f(v.world.x,fieldGround(v.world.xz),v.world.z);');
 s=s.replace('return vec4f(c,1);','return vec4f(aerial(c,v.world),1);');
 return s;
}
export const residentGrass=adaptMeadow(grass);
export function distantMeadow(grid=256){
 let s=adaptMeadow(distantGrass);
 s=s.replaceAll('512u',`${grid}u`).replaceAll('vec2f(256.)',`vec2f(${grid/2}.)`);
 s=s.replace('vec3f(center.x,0.,center.y)-cam.eye.xyz','vec3f(center.x,fieldGround(center),center.y)-cam.eye.xyz');
 s=s.replace('let offset=vec3f(center.x-cam.eye.x,0.5-cam.eye.y,center.y-cam.eye.z);','let offset=vec3f(center.x-cam.eye.x,fieldGround(center)+.5-cam.eye.y,center.y-cam.eye.z);');
 s=s.replace('let root=r.xyz;','let valid=coverMask(r.xz);if(valid<.02){return o;}\n let root=r.xyz+vec3f(0.,fieldGround(r.xz),0.);');
 s=s.replace('let root=vec3f(r.x,r.y*cam.misc.x,r.z);','let root=r.xyz+vec3f(0.,fieldGround(r.xz),0.);');
 // This branch follows the exact source plant sampling and organ geometry.
 return s;
}
export function meadowFlowers(grid=256){
 let s=adaptMeadow(distantFlowers).replaceAll('512u',`${grid}u`).replaceAll('vec2f(256.)',`vec2f(${grid/2}.)`);
 s=s.replace('vec3f(point.x,0.,point.y)-cam.eye.xyz','vec3f(point.x,fieldGround(point),point.y)-cam.eye.xyz');
 s=s.replace('if(bio.w<3.||bio.z!=1.){return o;}','if(bio.w<3.||bio.z!=1.||coverMask(r.xz)<.1){return o;}');
 s=s.replace('let position=r.xyz+organCurve', 'let position=r.xyz+vec3f(0.,fieldGround(r.xz),0.)+organCurve');
 return s;
}
// Saltreach's depth absorption, guarded screen refraction, Fresnel reflection,
// derivative-filtered GGX and connected foam filaments, translated from its TSL
// shading.js to native WGSL. Flow-map phases follow MountainRIver's 0.85s reset.
export const waterShader=common+/* wgsl */`
override FAR:bool=false;
struct Water { @builtin(position) p:vec4f,@location(0) world:vec3f,@location(1) slope:vec2f,@location(2) state:vec4f,@location(3) flow:vec4f }
fn offshore(p:vec2f)->vec3f {
 var h=0.;var slope=vec2f(0.);
 for(var b=0u;b<4u;b++){
  let k=6.2831853/(32.+f32(b)*11.);let a=-.55+f32(b)*.34;let dir=vec2f(cos(a),sin(a));
  let phase=k*dot(dir,p)-sqrt(9.81*k)*cam.eye.w+f32(b)*2.399963;
  let amplitude=.20/(1.+f32(b)*.6)*isle.weather.y;
  h+=cos(phase)*amplitude;slope-=sin(phase)*amplitude*k*dir;
 }
 return vec3f(h+isle.weather.x,slope);
}
@vertex fn waterVs(@builtin(vertex_index) vertex:u32)->Water {
 var pos=vec2f(0.);var level=0.;var depth=0.;var slope=vec2f(0.);var foam=vec2f(0.);var flow=vec4f(0.);
 if(!FAR){
  let n=isle.grid.x*isle.grid.y;let i=vertex%isle.grid.x;let j=vertex/isle.grid.x;
  pos=isle.domain.xy+vec2f(f32(i),f32(j))*isle.domain.zw;
  level=waterEta[vertex];depth=level-waterState[n+vertex];
  let l=j*isle.grid.x+max(i,1u)-1u;let r=j*isle.grid.x+min(i+1u,isle.grid.x-1u);
  let b=(max(j,1u)-1u)*isle.grid.x+i;let f=min(j+1u,isle.grid.y-1u)*isle.grid.x+i;
  slope=vec2f(waterEta[r]-waterEta[l],waterEta[f]-waterEta[b])/(isle.domain.zw*2.);
  foam=vec2f(waterState[5u*n+vertex],waterState[6u*n+vertex]);
  flow=vec4f(waterState[9u*n+vertex],waterState[10u*n+vertex],waterState[3u*n+vertex],waterState[4u*n+vertex]);
  let border=max(abs(pos.x),abs(pos.y));let blend=smoothstep(354.,400.,border);let outer=offshore(pos);
  level=mix(level,outer.x,blend);slope=mix(slope,outer.yz,blend);
 }else{
  let corners=array<vec2f,6>(vec2f(0,0),vec2f(0,1),vec2f(1,0),vec2f(1,0),vec2f(0,1),vec2f(1,1));
  let part=vertex/(32u*32u*6u);let local=vertex%(32u*32u*6u);let cell=local/6u;
  let uv=(vec2f(f32(cell%32u),f32(cell/32u))+corners[local%6u])/32.;
  // Four rectangular annuli keep an exact hole for the simulated square.
  if(part==0u){pos=vec2f(mix(-16000.,-400.,uv.x),mix(-16000.,16000.,uv.y));}
  if(part==1u){pos=vec2f(mix(400.,16000.,uv.x),mix(-16000.,16000.,uv.y));}
  if(part==2u){pos=vec2f(mix(-400.,400.,uv.x),mix(-16000.,-400.,uv.y));}
  if(part==3u){pos=vec2f(mix(-400.,400.,uv.x),mix(400.,16000.,uv.y));}
  let outer=offshore(pos);level=outer.x;slope=outer.yz;depth=24.;flow=vec4f(pos,0.,0.);
 }
 var o:Water;o.world=vec3f(pos.x,level,pos.y);o.p=project(o.world);o.slope=slope;o.state=vec4f(depth,foam,0.);o.flow=flow;return o;
}
fn advectedNoise(p:vec2f,flow:vec2f,scale:f32)->f32 {
 let phase=fract(cam.eye.w/.85);let phase2=fract(phase+.5);let weight=abs(phase*2.-1.);
 return mix(noise((p-flow*phase*.85)*scale),noise((p-flow*phase2*.85)*scale),weight);
}
@fragment fn waterFs(v:Water)->@location(0) vec4f {
 let p=v.world;let depth=max(v.state.x,0.);let distance=length(cam.eye.xyz-p);
 let phase=vec2f(cam.eye.w*.07,-cam.eye.w*.03);
 let coarse=vec2f(advectedNoise(p.xz,v.flow.zw,.72),advectedNoise(p.zx,v.flow.wz,.67))-.5;
 let fine=vec2f(advectedNoise(p.xz+coarse*.2,v.flow.zw,2.3),advectedNoise(p.zx-coarse*.2,v.flow.wz,2.7))-.5;
 let density=v.state.y*.8+v.state.z*.5;
 let micro=(coarse*.17+fine*.055)*(1.-smoothstep(70.,320.,distance))*smoothstep(.015,.3,depth)*(1.-v.state.y*.55);
 let normalFade=1.-smoothstep(350.,2400.,distance);
 let n=normalize(vec3f((-v.slope.x+micro.x)*normalFade,1.,(-v.slope.y+micro.y)*normalFade));
 let eye=normalize(cam.eye.xyz-p);let ndv=clamp(dot(n,eye),.015,1.);
 let fresnel=.021+pow(1.-ndv,5.)*.979;
 let q=mix(p.xz,v.flow.xy,.65);
 let n0=noise(q*.075);let n1=noise(q*.35+n0*.37);let n2=noise(q*1.35+n1*.21);
 let lace=n0*.36+n1*.42+n2*.22;let threshold=.74-density*.19;
 let aa=max(.018,fwidth(lace)*.8);
 let coverage=smoothstep(threshold-aa,threshold+aa,lace)*smoothstep(.025,.15,density);
 let holes=smoothstep(.62,.77,n2)*(1.-v.state.y*.7);
 let filaments=1.-smoothstep(.012+density*.018,.052+density*.018,abs(n1-.5));
 let patches=smoothstep(.35,.62,n0+v.state.y*.14);
 let foam=clamp((filaments*smoothstep(.12,.7,density)*.78+coverage*smoothstep(.4,.85,v.state.y))*patches,0.,1.)*(1.-holes*.62)*smoothstep(.003,.025,depth);
 let variance=(dot(dpdx(n),dpdx(n))+dot(dpdy(n),dpdy(n)))*.3;
 let pixel=v.p.xy/isle.view.xy;
 let normalScreen=vec2f(dot(n,cam.right.xyz),-dot(n,cam.up.xyz));
 let refractUV=clamp(pixel+normalScreen*min(depth,.8)*.035/max(1.,distance*.15),vec2f(.001),vec2f(.999));
 let size=vec2i(textureDimensions(opaqueDepth));
 let backgroundZ=textureLoad(opaqueDepth,clamp(vec2i(refractUV*vec2f(size)),vec2i(0),size-1),0);
 let waterZ=v.p.z;let guard=smoothstep(0.,.00012,backgroundZ-waterZ);
 let refracted=textureSampleLevel(opaqueColor,clampSampler,mix(pixel,refractUV,guard),0.).rgb;
 let opticalDepth=min(depth/max(.22,ndv),20.);
 let transmission=exp(vec3f(-.86,-.28,-.18)*opticalDepth);
 let seaBase=mix(vec3f(.035,.26,.28),vec3f(.007,.052,.084),smoothstep(.35,3.5,depth));
 let transmitted=refracted*transmission+seaBase*(1.-transmission);
 let reflectedDirection=reflect(-eye,n);var reflected=envSky(reflectedDirection);
 if(isle.grid.z>0u && p.y<2.5){
   let projected=project(vec3f(p.x,isle.weather.x*2.-p.y,p.z));
   let uv=projected.xy/projected.w*vec2f(.5,-.5)+.5;
   let distortion=n.xz*.014/max(1.,distance*.028)*(1.-foam*.8);
   let sampleUV=clamp(uv+distortion,vec2f(.001),vec2f(.999));
   let edge=smoothstep(.006,.055,uv.x)*(1.-smoothstep(.945,.994,uv.x))*smoothstep(.006,.04,uv.y)*(1.-smoothstep(.96,.994,uv.y));
   let reflectedScene=textureSampleLevel(mirrorColor,clampSampler,sampleUV,0.).rgb;
   let dims=vec2i(textureDimensions(mirrorDepth));let d=textureLoad(mirrorDepth,clamp(vec2i(sampleUV*vec2f(dims)),vec2i(0),dims-1),0);
   reflected=mix(reflected,reflectedScene,edge*(1.-smoothstep(.99999,1.,d)));
 }
 let halfVector=normalize(eye+SUN);let ndh=max(dot(n,halfVector),0.);let ndl=max(dot(n,SUN),0.);
 let roughness=.085+foam*.22;let a2=clamp(pow(roughness,4.)+variance,.00008,.12);
 let denom=ndh*ndh*(a2-1.)+1.;let distribution=a2/(denom*denom*3.14159265);
 let masking=ndl/(ndl*.92+.08)*ndv/(ndv*.92+.08);
 let sunFresnel=.021+pow(1.-max(dot(eye,halfVector),0.),5.)*.979;
 let sunlight=select(lightAt(p),1.,FAR);
 let glint=distribution*masking*sunFresnel/max(.06,ndv*4.)*.065*sunlight;
 var c=mix(transmitted,reflected,fresnel*.90)+vec3f(1.12,1.01,.78)*glint;
 let riverWhite=smoothstep(.2,.6,length(v.slope))*smoothstep(1.,3.2,length(v.flow.zw))*smoothstep(.06,.3,depth)*(1.-smoothstep(1.8,3.0,depth));
 let ivory=mix(vec3f(.61,.72,.76),vec3f(.94,.94,.86),sunlight)*(.78+ndl*.22*sunlight);
 c=mix(c,ivory,max(foam,riverWhite*.65));
 c=aerial(c,p);
 if(v.state.x<=0. || (cam.growth.w>.5)){discard;}
 return vec4f(mix(refracted,c,smoothstep(0.,.018,depth)),1.);
}
`;
export const sprayShader=common+/* wgsl */`
struct Drop { @builtin(position) p:vec4f,@location(0) uv:vec2f,@location(1) color:vec4f }
@vertex fn sprayVs(@builtin(vertex_index) i:u32,@builtin(instance_index) instance:u32)->Drop {
 let a=geometry[instance*2u];let b=geometry[instance*2u+1u];
 let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));let uv=corners[i];
 let world=a.xyz+cam.right.xyz*uv.x*b.x+cam.up.xyz*uv.y*b.y;var o:Drop;
 o.p=project(world);o.uv=uv;o.color=vec4f(.86,.92,.91,a.w);return o;
}
@fragment fn sprayFs(v:Drop)->@location(0) vec4f {let a=exp(-dot(v.uv,v.uv)*3.)*v.color.a;return vec4f(v.color.rgb,a);}
`;
export const postShader=/* wgsl */`
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var samp:sampler;
@group(0) @binding(2) var<uniform> params:vec4f;
`+fullscreen+/* wgsl */`
fn sampleImage(uv:vec2f)->vec3f {return textureSampleLevel(image,samp,uv,0.).rgb;}
fn luma(c:vec3f)->f32{return dot(c,vec3f(.299,.587,.114));}
fn tonemap(c:vec3f)->vec3f {return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),vec3f(0.),vec3f(1.));}
@fragment fn postFs(v:Screen)->@location(0) vec4f {
 let step=1./vec2f(textureDimensions(image));let c=sampleImage(v.uv);
 let a=sampleImage(v.uv+vec2f(-step.x,0.));let b=sampleImage(v.uv+vec2f(step.x,0.));
 let d=sampleImage(v.uv+vec2f(0.,-step.y));let e=sampleImage(v.uv+vec2f(0.,step.y));
 let low=min(luma(c),min(min(luma(a),luma(b)),min(luma(d),luma(e))));
 let high=max(luma(c),max(max(luma(a),luma(b)),max(luma(d),luma(e))));
 let edge=smoothstep(.075,.24,high-low);
 var color=mix(c,(a+b+d+e)*.25,edge*.38);
 color=pow(tonemap(max(color,vec3f(0.))*params.x),vec3f(1./2.2));
 let vignette=1.-dot(v.uv-.5,v.uv-.5)*.16;
 let dither=fract(sin(dot(v.p.xy,vec2f(12.9898,78.233)))*43758.5453)-.5;
 return vec4f(color*vignette+dither/255.,1.);
}
`;
