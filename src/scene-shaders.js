import {oceanWgsl} from './ocean.js';
import {visualMath} from './visual-math.js';
import {common as meadowCommon,grass,distantGrass,distantFlowers} from '../vendor/realgrass/src/shaders.js';

// Original plant/weather functions remain in the source. The flat-world camera
// and material hooks are adapted here, not replaced with a meadow lookalike.
const islandBindings=/* wgsl */`
struct Island { domain:vec4f, grid:vec4u, weather:vec4f, view:vec4f, coastBounds:vec4f, worldDomain:vec4f }
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
@group(1) @binding(6) var coastTexture:texture_2d<f32>;
@group(1) @binding(7) var coastSampler:sampler;
@group(1) @binding(8) var treeAlbedo:texture_2d<f32>;
@group(1) @binding(9) var treeAlpha:texture_2d<f32>;
@group(1) @binding(10) var treeBark:texture_2d<f32>;
fn coastNoise(p:vec2f)->vec4f{return textureSample(coastTexture,coastSampler,p);}
fn gridPoint(p:vec2f)->vec2f{return clamp((p-isle.domain.xy)/isle.domain.zw,vec2f(0.),vec2f(isle.grid.xy)-1.001);}
fn inIslandGrid(p:vec2f)->bool {let q=(p-isle.domain.xy)/isle.domain.zw;return all(q>=vec2f(0.))&&all(q<=vec2f(isle.grid.xy)-1.);}
fn fieldAt(layer:u32,p:vec2f)->f32{
 let g=gridPoint(p);let i=vec2u(g);let f=fract(g);let n=isle.grid.x*isle.grid.y;let k=layer*n+i.y*isle.grid.x+i.x;
 return mix(mix(waterState[k],waterState[k+1u],f.x),mix(waterState[k+isle.grid.x],waterState[k+isle.grid.x+1u],f.x),f.y);
}
fn fieldGround(p:vec2f)->f32 {return fieldAt(1u,p);}
fn nearbyWater(p:vec2f)->f32 {
 let d=3.;
 return max(fieldAt(2u,p),max(max(fieldAt(2u,p+vec2f(d,0.)),fieldAt(2u,p-vec2f(d,0.))),max(fieldAt(2u,p+vec2f(0.,d)),fieldAt(2u,p-vec2f(0.,d)))));
}
fn coverMask(p:vec2f)->f32 {
 if(!inIslandGrid(p)){return 0.;}
 let h=fieldGround(p);let slope=vec2f(fieldGround(p+vec2f(1.,0.))-fieldGround(p-vec2f(1.,0.)),fieldGround(p+vec2f(0.,1.))-fieldGround(p-vec2f(0.,1.)))*.5;
 return smoothstep(2.35,3.3,h)*(1.-smoothstep(130.,155.,h))*(1.-smoothstep(.70,1.15,dot(slope,slope)))*(1.-smoothstep(.003,.015,fieldAt(2u,p)))*(1.-smoothstep(.02,.07,fieldAt(0u,p)-h));
}
fn sediment(p:vec2f)->f32 {
 return smoothstep(3.8,7.,fieldGround(p))*(1.-smoothstep(430.,620.,p.y));
}
fn bankBlend(p:vec2f)->f32 {
 var sum=min(.25,fieldAt(2u,p))*.25;
 let axes=array<vec2f,4>(vec2f(1,0),vec2f(-1,0),vec2f(0,1),vec2f(0,-1));
 for(var i=0u;i<4u;i++){
  sum+=min(.25,fieldAt(2u,p+axes[i]*3.))*.125;
  sum+=min(.25,fieldAt(2u,p+axes[i]*6.))*.0625;
 }
 return smoothstep(.002,.10,sum);
}
fn surfaceMoisture(p:vec2f)->f32 {
 var wet=0.;
 for(var j=-1;j<=1;j++){for(var i=-1;i<=1;i++){
  let weight=select(1.,2.,i==0)*select(1.,2.,j==0);
  wet+=fieldAt(7u,p+vec2f(f32(i),f32(j))*2.5)*weight/16.;
 }}
 return smoothstep(.04,.96,wet);
}
fn lightAt(p:vec3f)->f32 {
 let uv=clamp((p.xz-isle.worldDomain.xy)/isle.worldDomain.zw,vec2f(.001),vec2f(.999));
 return textureSampleLevel(groundLight,clampSampler,uv,0.).r;
}
fn envSky(rd:vec3f)->vec3f {
 let uv=vec2f(atan2(rd.z,rd.x)/6.2831853+.5,1.-asin(clamp(rd.y,0.,1.))/1.5707963);
 return textureSampleLevel(environment,clampSampler,uv,0.).rgb;
}
fn aerial(c:vec3f,p:vec3f)->vec3f {
 let distance=length(p-cam.eye.xyz);
 let amount=1.-exp(-distance*.000065);
 return mix(c,vec3f(.38,.54,.65),amount);
}
`;
// Cache source cloud shadows in a world-space texture instead of running six
// volumetric samples per grass fragment. The generating pass still uses the
// original cloudSunlight/weatherDensity functions.
function adaptCommon(source){
 const start=source.indexOf('fn weatherDensity');
 const weather=source.slice(start).replaceAll('250.','850.').replaceAll('600.','1200.')
   .replace('f_cloudDensity(p.x,p.y,p.z,','f_cloudDensity(p.x,p.y-600.,p.z,');
 return visualMath((source.slice(0,start)+weather)
   .replace('const SUN = vec3f(-0.48,0.71,-0.51);','const SUN = vec3f(-0.480096,0.710142,-0.510102);')
   .replace('let sunlight=cloudSunlight(p);','let sunlight=lightAt(p);')) + islandBindings;
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
  return vec4f(pow(max(sky(rd),vec3f(0.)),vec3f(2.2)),1.);
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
@group(0) @binding(3) var<storage,read> forestShade:array<f32>;
struct Surface { @builtin(position) p:vec4f,@location(0) world:vec3f,@location(1) normal:vec3f,@location(2) data:vec4f,@location(3) uv:vec2f }
@vertex fn surfaceVs(@builtin(vertex_index) i:u32)->Surface {
 let a=geometry[i*2u];let b=geometry[i*2u+1u];var o:Surface;
 o.p=project(a.xyz);o.world=a.xyz;o.normal=normalize(b.xyz);o.data=vec4f(a.w,b.w,0.,0.);o.uv=vec2f(0.);return o;
}
fn mineral(p:vec3f,n:vec3f)->vec3f {
 let weights=pow(abs(n),vec3f(4.));let w=weights/max(dot(weights,vec3f(1.)),.001);
 let largeScale=fbm(p.yz*.034)*w.x+fbm(p.xz*.034)*w.y+fbm(p.xy*.034)*w.z;
 let mid=fbm(p.yz*.41)*w.x+fbm(p.xz*.41)*w.y+fbm(p.xy*.41)*w.z;
 let grain=noise(p.yz*2.4)*w.x+noise(p.xz*2.4)*w.y+noise(p.xy*2.4)*w.z;
 let cracks=1.-smoothstep(.014,.07,abs(mid-.49));
 let vein=(1.-smoothstep(.014,.035,abs(sin(dot(p,vec3f(.93,.70,-.52))+mid*.56))))*.065;
 return mix(vec3f(.19,.215,.205),vec3f(.49,.44,.35),largeScale)*mix(.68,1.25,mid)*mix(.87,1.1,grain)*(1.-cracks*.14)+vec3f(.65,.60,.47)*vein;
}
fn canopyShade(p:vec3f)->f32 {
 let nx=u32(isle.worldDomain.z/isle.view.w)+1u;
 let q=clamp((p.xz-isle.worldDomain.xy)/isle.view.w,vec2f(0.),vec2f(f32(nx)-1.001));let f=fract(q);let ij=vec2u(q);let k=ij.y*nx+ij.x;
 let shadow=mix(mix(forestShade[k],forestShade[k+1u],f.x),mix(forestShade[k+nx],forestShade[k+nx+1u],f.x),f.y);
 return mix(shadow,1.,smoothstep(1.,10.,p.y-fieldGround(p.xz)));
}
fn diffuseSurface(color:vec3f,n:vec3f,p:vec3f,wet:f32)->vec3f {
 let shade=canopyShade(p);let sunlight=lightAt(p)*shade;let ndl=max(dot(n,SUN),0.);
 let ambient=vec3f(.32,.40,.49)*(.66+.34*max(n.y,0.))*mix(.72,1.,shade);
 let direct=vec3f(1.12,1.04,.84)*ndl*sunlight;
 let halfVector=normalize(SUN+normalize(cam.eye.xyz-p));
 let spec=pow(max(dot(n,halfVector),0.),mix(18.,90.,wet))*.22*wet*sunlight;
 return aerial(pow(max(color,vec3f(0.)),vec3f(2.2))*(ambient+direct)+vec3f(spec),p);
}
`;
export const actorShader=common+surfaceVertex+/* wgsl */`
@group(0) @binding(1) var<storage,read> actors:array<vec4f>;
fn rotateActor(p:vec3f,yaw:f32,tilt:f32)->vec3f {
 let q=vec3f(p.x,cos(tilt)*p.y-sin(tilt)*p.z,sin(tilt)*p.y+cos(tilt)*p.z);
 return vec3f(cos(yaw)*q.x-sin(yaw)*q.z,q.y,sin(yaw)*q.x+cos(yaw)*q.z);
}
@vertex fn actorVs(@builtin(vertex_index) i:u32,@builtin(instance_index) instance:u32)->Surface{
 let origin=actors[instance*3u];let scale=actors[instance*3u+1u];let pose=actors[instance*3u+2u];
 let a=geometry[i*2u];let b=geometry[i*2u+1u];let p=origin.xyz+rotateActor(a.xyz*scale.xyz,scale.w,pose.x);
 var o:Surface;o.world=p;o.p=project(p);o.normal=rotateActor(b.xyz/scale.xyz,scale.w,pose.x);o.data=vec4f(origin.w,0.,0.,0.);o.uv=vec2f(0.);return o;
}
@fragment fn actorFs(v:Surface)->@location(0) vec4f{
 let colors=array<vec3f,8>(vec3f(.70,.34,.12),vec3f(.16,.20,.21),vec3f(.64,.45,.32),vec3f(.17,.115,.075),vec3f(.26,.30,.18),vec3f(.10,.12,.12),vec3f(.19,.32,.09),vec3f(.30,.06,.18));
 let color=colors[min(u32(round(v.data.x)),7u)]*(.96+.04*noise(v.world.xz*35.));
 return vec4f(diffuseSurface(color,normalize(v.normal),v.world,0.),1.);
}
`;
export const terrainShader=common+surfaceVertex+/* wgsl */`
@group(0) @binding(2) var<storage,read> parentState:array<f32>;
@vertex fn terrainVs(@builtin(vertex_index) i:u32)->Surface {
 let a=geometry[i*2u];let b=geometry[i*2u+1u];var world=a.xyz;
 if(isle.grid.w==1u){
  let nx=u32(isle.worldDomain.z/isle.view.w)+1u;
  let q=clamp((world.xz-isle.worldDomain.xy)/isle.view.w,vec2f(0.),vec2f(f32(nx)-1.001));let f=fract(q);let ij=vec2u(q);let k=nx*nx+ij.y*nx+ij.x;
  var h=parentState[k]+(parentState[k+1u]-parentState[k])*f.x+(parentState[k+nx]-parentState[k])*f.y;
  if(f.x+f.y>1.){h=parentState[k+nx+1u]+(parentState[k+nx]-parentState[k+nx+1u])*(1.-f.x)+(parentState[k+1u]-parentState[k+nx+1u])*(1.-f.y);}
  let edge=min(min(world.x-isle.coastBounds.x,isle.coastBounds.z-world.x),min(world.z-isle.coastBounds.y,isle.coastBounds.w-world.z));
  world.y=mix(h,world.y,smoothstep(0.,24.,edge));
 }
 var o:Surface;o.world=world;o.p=project(world);o.normal=normalize(b.xyz);o.data=vec4f(a.w,b.w,0.,0.);o.uv=vec2f(0.);return o;
}
@fragment fn terrainFs(v:Surface)->@location(0) vec4f {
 let inside=all(v.world.xz>isle.coastBounds.xy)&&all(v.world.xz<isle.coastBounds.zw);
 if(cam.growth.w<.5 && ((isle.grid.w==0u && inside)||(isle.grid.w==1u && !inside))){discard;}
 let p=v.world;var n=normalize(v.normal);let distance=length(p-cam.eye.xyz);
 let footprint=max(length(dpdx(p.xz)),length(dpdy(p.xz)));
 let wet=surfaceMoisture(p.xz);let film=fieldAt(8u,p.xz);
 let sandMacro=coastNoise(p.xz*.014).r;let grain=coastNoise(p.xz*2.1).b;
 let ripplePhase=p.x*31.+sin(p.z*.9)*2.8+coastNoise(p.xz*.06).r*4.;
 let ripples=sin(ripplePhase)*.5*(1.-smoothstep(1.,3.,fwidth(ripplePhase)))+.5;
 let dry=mix(vec3f(.714,.631,.537),vec3f(.804,.714,.592),sandMacro);
 let damp=mix(vec3f(.455,.475,.431),vec3f(.592,.553,.467),sandMacro);
 let sand=mix(dry,damp,wet*.84)*mix(.93,1.06,grain)*mix(.965,1.02,ripples);
 let meadow=canopySurface(p,footprint);
 let broadLand=mix(vec3f(.25,.32,.18),vec3f(.36,.37,.25),noise(p.xz*.004));
 let land=mix(meadow,broadLand,smoothstep(30.,130.,distance)*.82);
 let vegetation=smoothstep(2.0,3.8,p.y)*smoothstep(.55,.83,n.y)*(1.-smoothstep(110.,230.,p.y));
 var base=mix(sand,land,vegetation);
 // Inland wetted beds expose mineral gravel rather than meadow or beach sand.
 let riverWet=sediment(p.xz)*bankBlend(p.xz);
 let soil=mix(vec3f(.36,.31,.24),vec3f(.48,.43,.34),noise(p.xz*.8));
 let gravel=mix(mineral(p,n),soil,.45)*mix(.9,1.08,grain);
 base=mix(base,gravel,riverWet*(.65+.35*noise(p.xz*1.7)));
 let rockiness=max((1.-smoothstep(.65,.90,n.y)),smoothstep(145.,210.,p.y))*smoothstep(3.,9.,p.y);
 base=mix(base,mineral(p,n),rockiness);
 base*=mix(1.,.86,clamp(wet+film*.22,0.,1.)*vegetation);
 let detail=(noise(p.xz*6.)-.5)*(1.-smoothstep(35.,120.,distance));
 n=normalize(n+vec3f(detail*.14,0.,detail*.08));
 // Caustic detail follows actual shallow, unfoamed water.
 let depth=fieldAt(2u,p.xz);let foam=fieldAt(5u,p.xz);
 let caustic=pow(1.-abs(coastNoise(p.xz*.12+vec2f(cam.eye.w*.007,cam.eye.w*.004)).g+coastNoise(p.xz*.133-vec2f(cam.eye.w*.005,cam.eye.w*.008)).g-1.),22.)
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
 var c=mix(mineral(p,n),vec3f(.15,.21,.074),moss*.74)*mix(1.,.72,wet);
 return vec4f(diffuseSurface(c,n,p,wet),1.);
}
`;
// Small real geometry, rooted in the same riverbed as the water. Deterministic
// world cells keep stones fixed as the camera moves; no animated CPU uploads.
export const foliageShader=common+surfaceVertex+/* wgsl */`
override TREE_SEGMENTS:u32=12u;
override TREE_LOD:u32=0u;
@group(0) @binding(4) var<storage,read> visibleTrees:array<u32>;
@vertex fn foliageVs(@builtin(vertex_index) i:u32,@builtin(instance_index) instance:u32)->Surface {
 // Twelve segments preserve the rise and weight-induced sag of each limb.
 let stride=(TREE_SEGMENTS+1u)*2u;let tree=visibleTrees[TREE_LOD*(arrayLength(&visibleTrees)/3u)+instance];
 let card=tree*192u+i/stride;let local=i%stride;let u=f32(local/2u)/f32(TREE_SEGMENTS);let side=f32(local%2u)*2.-1.;
 let p0=geometry[card*8u];let p1=geometry[card*8u+2u];
 let p2=geometry[card*8u+4u];let p3=geometry[card*8u+6u];
 let b=geometry[card*8u+1u];let a=mix(mix(p0,p1,u),mix(p3,p2,u),(side+1.)*.5);
 let reach=length((p1.xyz+p2.xyz-p0.xyz-p3.xyz)*.5);
 let limb=select(1.,0.,a.w<0.);let load=1.-b.w*.7;
 let arc=reach*(.32*u-.58*u*u)*load;
 let pendant=reach*.10*abs(side)*sin(u*3.14159265)*load;
 let wind=sin(a.x*.12+a.z*.09-cam.eye.w*1.3)*.10*cam.atmosphere.y;
 let world=a.xyz+vec3f(wind*u*u,arc-pendant,wind*.37*u*u)*limb;
 let axis=normalize(p1.xyz+p2.xyz-p0.xyz-p3.xyz+vec3f(.00001,0.,0.));
 let bendSlope=(.32-1.16*u)*load*limb;
 let normal=normalize(b.xyz-vec3f(axis.x,0.,axis.z)*bendSlope*b.y);
 var o:Surface;o.world=world;o.normal=normal;o.p=project(world);o.uv=vec2f(u,side);o.data=vec4f(a.w,b.w,0.,0.);return o;
}

@fragment fn foliageFs(v:Surface)->@location(0) vec4f {
 let u=v.uv.x;let seed=v.data.x;
 // Photographed twig atlas sampled along paired secondary branches.
 let lateral=abs(v.uv.y);let side=sign(v.uv.y);
 let envelope=pow(max(0.,1.-u),.72)*smoothstep(0.,.10,u)*(.88+.09*sin(u*23.+seed*11.));
 let station=(u-lateral*(.16+seed*.09))*(15.+seed*4.)+side*.24+seed;
 let twigUV=vec2f(fract(station)*.237,(1.-clamp(lateral/max(envelope,.001),0.,1.))*.445);
 let alpha=textureSample(treeAlpha,clampSampler,twigUV).r;
 let texel=textureSample(treeAlbedo,clampSampler,twigUV).rgb;
 let bark=textureSample(treeBark,coastSampler,vec2f((v.world.x+v.world.z)*.9,v.world.y*.3)).rgb*.75;
 if(v.data.x<0.){
   return vec4f(diffuseSurface(bark,normalize(v.normal),v.world,0.),1.);
 }
 if(lateral>envelope || (alpha<.24 && lateral>.012*(1.-u)) || (cam.growth.w>.5&&v.world.y<isle.weather.x)){discard;}
 // The atlas has black outside its alpha mask. Undo that filtered black
 // contribution so distant needles do not turn into nearly black cones.
 let color=min(texel/mix(1.,max(alpha,.24),.65),vec3f(.85))*vec3f(.94,1.16,.87)*mix(.93,1.13,seed);
 let n=normalize(v.normal+vec3f(v.uv.y*.15,.35,u*.15));
 // Thin needle clusters receive light on both sides. Outer growth is more
 // exposed than the shaded branch interior; no extra shadow pass is required.
 let sun=lightAt(v.world);let wrap=.25+.75*abs(dot(n,SUN));
 let exposure=mix(.65,1.,smoothstep(.05,.8,u));
 let lighting=vec3f(.36,.43,.49)*exposure+vec3f(1.12,1.04,.84)*wrap*sun;
 return vec4f(aerial(pow(max(color,vec3f(0.)),vec3f(2.2))*lighting,v.world),1.);
}
`;
function adaptMeadow(source) {
 let s=source.replace(meadowCommon,common);
 s=s.replaceAll('vec3f(r.x,0.,r.z)-cam.eye.xyz','r.xyz-cam.eye.xyz').replaceAll('vec3f(r.x,r.y*cam.misc.x,r.z)','r.xyz');
 s=s.replace('let groundPoint=cam.eye.xyz+ray*(-cam.eye.y/min(ray.y,-0.0001));','let groundPoint=vec3f(v.world.x,fieldGround(v.world.xz),v.world.z);');
 s=s.replace('return vec4f(c,1);','return vec4f(aerial(pow(max(c,vec3f(0.)),vec3f(2.2)),v.world),1);');
 s=s.replace('return vec4f(c*weatherLight(v.world),1.);','return vec4f(aerial(pow(max(c*weatherLight(v.world),vec3f(0.)),vec3f(2.2)),v.world),1.);');
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
@group(0) @binding(1) var<storage,read> coarseEta:array<f32>;
@group(0) @binding(2) var<storage,read> parentState:array<f32>;
fn parentField(layer:u32,p:vec2f)->f32 {
 let nx=u32(isle.worldDomain.z/isle.view.w)+1u;
 let q=clamp((p-isle.worldDomain.xy)/isle.view.w,vec2f(0.),vec2f(f32(nx)-1.001));let f=fract(q);let ij=vec2u(q);let k=layer*nx*nx+ij.y*nx+ij.x;
 return mix(mix(parentState[k],parentState[k+1u],f.x),mix(parentState[k+nx],parentState[k+nx+1u],f.x),f.y);
}
fn coarseLevel(p:vec2f)->f32{
 let nx=u32(isle.worldDomain.z/isle.view.w)+1u;
 let q=clamp((p-isle.worldDomain.xy)/isle.view.w,vec2f(0.),vec2f(f32(nx)-1.001));let ij=vec2u(q);let f=fract(q);let k=ij.y*nx+ij.x;
 if(f.x+f.y<=1.){return coarseEta[k]+(coarseEta[k+1u]-coarseEta[k])*f.x+(coarseEta[k+nx]-coarseEta[k])*f.y;}
 return coarseEta[k+nx+1u]+(coarseEta[k+nx]-coarseEta[k+nx+1u])*(1.-f.x)+(coarseEta[k+1u]-coarseEta[k+nx+1u])*(1.-f.y);
}

struct Water { @builtin(position) p:vec4f,@location(0) world:vec3f,@location(1) slope:vec2f,@location(2) state:vec4f,@location(3) flow:vec4f }
${oceanWgsl}
@vertex fn waterVs(@builtin(vertex_index) vertex:u32)->Water {
 var pos=vec2f(0.);var level=0.;var depth=0.;var slope=vec2f(0.);var foam=vec2f(0.);var flow=vec4f(0.);
 if(!FAR){
  let n=isle.grid.x*isle.grid.y;let i=vertex%isle.grid.x;let j=vertex/isle.grid.x;
  pos=isle.domain.xy+vec2f(f32(i),f32(j))*isle.domain.zw;
  level=waterEta[vertex];depth=level-waterState[vertex];
  let l=j*isle.grid.x+max(i,1u)-1u;let r=j*isle.grid.x+min(i+1u,isle.grid.x-1u);
  let b=(max(j,1u)-1u)*isle.grid.x+i;let f=min(j+1u,isle.grid.y-1u)*isle.grid.x+i;
  let wl=i>0u && waterState[2u*n+l]>=.0005 && min(level,waterEta[l])>max(waterState[vertex],waterState[l]);
   let wr=i<isle.grid.x-1u && waterState[2u*n+r]>=.0005 && min(level,waterEta[r])>max(waterState[vertex],waterState[r]);
   let wb=j>0u && waterState[2u*n+b]>=.0005 && min(level,waterEta[b])>max(waterState[vertex],waterState[b]);
   let wf=j<isle.grid.y-1u && waterState[2u*n+f]>=.0005 && min(level,waterEta[f])>max(waterState[vertex],waterState[f]);
   slope=vec2f(select(0.,(select(level,waterEta[r],wr)-select(level,waterEta[l],wl))/(isle.domain.z*select(1.,2.,wl&&wr)),wl||wr),select(0.,(select(level,waterEta[f],wf)-select(level,waterEta[b],wb))/(isle.domain.w*select(1.,2.,wb&&wf)),wb||wf));
  foam=vec2f(waterState[5u*n+vertex],waterState[6u*n+vertex]);
  flow=vec4f(waterState[9u*n+vertex],waterState[10u*n+vertex],waterState[3u*n+vertex],waterState[4u*n+vertex]);
  let border=max(abs(pos.x),abs(pos.y));let blend=select(smoothstep(-isle.domain.x-150.,-isle.domain.x,border),0.,isle.grid.w==1u);let outer=offshore(pos);
  // Both meshes meet at mean tide. The shared analytic normal retains distant
  // swell without undersampling displacement on the coarse horizon mesh.
  level=mix(level,isle.weather.x,blend);slope=mix(slope,outer.yz,blend);
   if(isle.grid.w==1u){
    let edge=min(min(pos.x-isle.coastBounds.x,isle.coastBounds.z-pos.x),min(pos.y-isle.coastBounds.y,isle.coastBounds.w-pos.y));
    let fine=smoothstep(8.,32.,edge);let d=isle.view.w;
    let cs=vec2f(coarseLevel(pos+vec2f(d,0.))-coarseLevel(pos-vec2f(d,0.)),coarseLevel(pos+vec2f(0.,d))-coarseLevel(pos-vec2f(0.,d)))/(2.*d);
    level=mix(coarseLevel(pos),level,fine);slope=mix(cs,slope,fine);
    foam=mix(vec2f(parentField(5u,pos),parentField(6u,pos)),foam,fine);
    flow=mix(vec4f(parentField(9u,pos),parentField(10u,pos),parentField(3u,pos),parentField(4u,pos)),flow,fine);
   }
 }else{
  let corners=array<vec2f,6>(vec2f(0,0),vec2f(0,1),vec2f(1,0),vec2f(1,0),vec2f(0,1),vec2f(1,1));
  let part=vertex/(32u*32u*6u);let local=vertex%(32u*32u*6u);let cell=local/6u;
  let uv=(vec2f(f32(cell%32u),f32(cell/32u))+corners[local%6u])/32.;
  let bound=-isle.domain.x;
  // Four rectangular annuli keep an exact hole for the simulated square.
  if(part==0u){pos=vec2f(mix(-16000.,-bound,uv.x),mix(-16000.,16000.,uv.y));}
  if(part==1u){pos=vec2f(mix(bound,16000.,uv.x),mix(-16000.,16000.,uv.y));}
  if(part==2u){pos=vec2f(mix(-bound,bound,uv.x),mix(-16000.,-bound,uv.y));}
  if(part==3u){pos=vec2f(mix(-bound,bound,uv.x),mix(bound,16000.,uv.y));}
  let outer=offshore(pos);level=isle.weather.x;slope=outer.yz;depth=24.;flow=vec4f(pos,0.,0.);
 }
 var o:Water;o.world=vec3f(pos.x,level,pos.y);o.p=project(o.world);o.slope=slope;o.state=vec4f(depth,foam,0.);o.flow=flow;return o;
}
fn advectedNoise(p:vec2f,flow:vec2f,scale:f32)->f32 {
 let phase=fract(cam.eye.w/.85);let phase2=fract(phase+.5);let weight=abs(phase*2.-1.);
 return mix(noise((p-flow*phase*.85)*scale),noise((p-flow*phase2*.85)*scale),weight);
}
fn sceneReflection(p:vec3f,direction:vec3f)->vec4f {
 // Reflect the same opaque scene into inland water, whose elevation is not
 // the sea-level planar mirror. Misses use the common sky environment.
 let size=vec2i(textureDimensions(opaqueDepth));var travel=.35;
 for(var i=0u;i<16u;i++){
   let q=p+direction*travel;let clip=project(q);
   if(clip.w<=.05){break;}
   let uv=clip.xy/clip.w*vec2f(.5,-.5)+.5;
   if(any(uv<vec2f(.001))||any(uv>vec2f(.999))){break;}
   let depth=textureLoad(opaqueDepth,clamp(vec2i(uv*vec2f(size)),vec2i(0),size-1),0);
   let sceneDistance=.050000025/max(1.0000005-depth,.0000001);
   let difference=clip.w-sceneDistance;
   if(depth<.999999 && difference>0. && difference<max(.35,travel*.065)){
     let edge=smoothstep(0.,.08,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
     return vec4f(textureSampleLevel(opaqueColor,clampSampler,uv,0.).rgb,edge*(1.-smoothstep(65.,100.,travel)));
   }
   travel=travel*1.34+.35;
 }
 return vec4f(0.);
}
@fragment fn waterFs(v:Water)->@location(0) vec4f {
 let p=v.world;
 // Evaluate the bed continuously at the fragment, not a triangle's interpolated
 // vertex depths. Dry rock cells cannot manufacture visible water or foam.
 let signedDepth=select(p.y-fieldAt(0u,p.xz),v.state.x,FAR);
 let depth=max(signedDepth,0.);let distance=length(cam.eye.xyz-p);
 let phase=vec2f(cam.eye.w*.07,-cam.eye.w*.03);
 let rippleUV=mix(p.xz,v.flow.xy,.55);
 let coarse=coastNoise(rippleUV*.047+vec2f(cam.eye.w*.007,cam.eye.w*-.003)).rg-.5;
 let fine=coastNoise(rippleUV*.18+coarse*.10+vec2f(cam.eye.w*-.011,cam.eye.w*.006)).ga-.5;
 let density=v.state.y*.8+v.state.z*.5;
 let seaWeight=1.-smoothstep(1.,3.,p.y);
 let micro=(coarse*.25+fine*.12)*mix(.3,1.,seaWeight)*(1.-smoothstep(70.,320.,distance))*smoothstep(.015,.3,depth)*(1.-v.state.y*.55);
 let normalFade=1.-smoothstep(350.,2400.,distance);
 let analytic=offshore(p.xz);
 let edgeBlend=select(select(smoothstep(-isle.domain.x-150.,-isle.domain.x,max(abs(p.x),abs(p.z))),0.,isle.grid.w==1u),1.,FAR);
 let waveSlope=mix(v.slope,analytic.yz,edgeBlend);
 let n=normalize(vec3f((-waveSlope.x+micro.x)*normalFade,1.,(-waveSlope.y+micro.y)*normalFade));
 let eye=normalize(cam.eye.xyz-p);let ndv=clamp(dot(n,eye),.015,1.);
 let fresnel=.021+pow(1.-ndv,5.)*.979;
 let q=v.flow.xy;
 let n0=coastNoise(q*.075).r;let n1=coastNoise(q*.35+n0*.37).r;let n2=coastNoise(q*1.35+n1*.21).g;
 let lace=n0*.36+n1*.42+n2*.22;let threshold=.74-density*.19;
 let aa=max(.018,fwidth(lace)*.8);
 let coverage=smoothstep(threshold-aa,threshold+aa,lace)*smoothstep(.025,.15,density);
 let holes=smoothstep(.62,.77,n2)*(1.-v.state.y*.7);
 let filaments=1.-smoothstep(.012+density*.018,.052+density*.018,abs(n1-.5));
 let patches=smoothstep(.35,.62,n0+v.state.y*.14);
 let foam=clamp((filaments*smoothstep(.12,.7,density)*.78+coverage*smoothstep(.4,.85,v.state.y))*patches,0.,1.)*(1.-holes*.62)*mix(.8,1.,coastNoise(q*4.3).a)*smoothstep(.003,.025,depth);
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
 let seaBase=mix(vec3f(.008568,.124772,.181164),vec3f(.002125,.034340,.064803),smoothstep(.35,3.5,depth));
 let transmitted=refracted*transmission+seaBase*(1.-transmission);
 let reflectedDirection=reflect(-eye,n);var reflected=envSky(reflectedDirection);
 if(!FAR && p.y>2.5 && distance<120.){let localReflection=sceneReflection(p+n*.08,reflectedDirection);reflected=mix(reflected,localReflection.rgb,localReflection.a*(1.-smoothstep(80.,120.,distance)));}
 // Rough sky reflection avoids the old planar island silhouette on the sea.
 reflected=(reflected+envSky(normalize(reflectedDirection+vec3f(.18,.12,0.)))
   +envSky(normalize(reflectedDirection+vec3f(-.18,.12,0.)))
   +envSky(normalize(reflectedDirection+vec3f(0.,.12,.18)))
   +envSky(normalize(reflectedDirection+vec3f(0.,.12,-.18))))*.2;
 let halfVector=normalize(eye+SUN);let ndh=max(dot(n,halfVector),0.);let ndl=max(dot(n,SUN),0.);
 let roughness=.085+foam*.22;let a2=clamp(pow(roughness,4.)+variance,.00008,.12);
 let denom=ndh*ndh*(a2-1.)+1.;let distribution=a2/(denom*denom*3.14159265);
 let masking=ndl/(ndl*.92+.08)*ndv/(ndv*.92+.08);
 let sunFresnel=.021+pow(1.-max(dot(eye,halfVector),0.),5.)*.979;
 let sunlight=select(lightAt(p),1.,FAR);
 let glint=distribution*masking*sunFresnel/max(.06,ndv*4.)*.028*sunlight;
 var c=mix(transmitted,reflected,fresnel*isle.view.z)+vec3f(1.12,1.01,.78)*glint;
 let crestLight=pow(max(dot(eye,-SUN),0.),3.)*smoothstep(.04,.22,abs(waveSlope.x))*(1.-smoothstep(.6,2.,depth))*.16;
 c+=vec3f(.18,.44,.34)*crestLight;
 let riverWhite=smoothstep(.2,.6,length(v.slope))*smoothstep(1.,3.2,length(v.flow.zw))*smoothstep(.06,.3,depth)*(1.-smoothstep(1.8,3.0,depth));
 let ivory=mix(vec3f(.61,.72,.76),vec3f(.94,.94,.86),sunlight)*(.78+ndl*.22*sunlight);
 c=mix(c,ivory,max(foam,riverWhite*.22));
 c=aerial(c,p);
 let insidePatch=all(p.xz>isle.coastBounds.xy)&&all(p.xz<isle.coastBounds.zw);
 if(!FAR && ((isle.grid.w==0u && insidePatch)||(isle.grid.w==1u && !insidePatch))){discard;}
 if(signedDepth<=.0005 || (!FAR && fieldAt(2u,p.xz)<.0005) || (cam.growth.w>.5)){discard;}
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
 color=mix(vec3f(dot(color,vec3f(.2126,.7152,.0722))),color,.84);
 color=pow(tonemap(max(color,vec3f(0.))*params.x),vec3f(1./2.2));
 let vignette=1.-dot(v.uv-.5,v.uv-.5)*.16;
 let dither=fract(sin(dot(v.p.xy,vec2f(12.9898,78.233)))*43758.5453)-.5;
 return vec4f(color*vignette+dither/255.,1.);
}
`;
