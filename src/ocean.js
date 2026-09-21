// One swell spectrum drives initial conditions, incoming boundary and offshore
// shading. Metres, seconds, radians; direction is the direction of propagation.
import {WAVES} from '../vendor/coast/src/coast.js';
// Original Saltreach wave parameters, reflected in X to approach the west coast.
export const OCEAN=Object.freeze({depth:24,bands:WAVES});
const f=n=>Number(n).toFixed(9);
export const oceanBands=WAVES.map(b=>({amplitude:b.a,k:b.k,kx:b.k,kz:-b.z,omega:b.w,phase:52*b.k-b.p,angle:Math.atan2(-b.z,b.k)}));
export function oceanSample(x,z,time,strength=1){const raw=oceanBands.reduce((s,b)=>{
 const phase=b.kx*x+b.kz*z-b.omega*time+b.phase;
 s.height+=b.amplitude*Math.cos(phase)*strength;
 s.dx-=b.amplitude*b.kx*Math.sin(phase)*strength;
 s.dz-=b.amplitude*b.kz*Math.sin(phase)*strength;return s;
},{height:0,dx:0,dz:0});
 const group=.79+.16*Math.sin(time*.071+z*.018)+.10*Math.sin(time*.117-z*.031);
 const dz=.16*.018*Math.cos(time*.071+z*.018)-.10*.031*Math.cos(time*.117-z*.031);
 return {height:raw.height*group,dx:raw.dx*group,dz:raw.dz*group+raw.height*dz};}
export const oceanCuda=['height','x','z'].map(axis=>`__device__ float ocean${axis}(float x,float z,float time,float strength){return strength*(.79f+.16f*sinf(time*.071f+z*.018f)+.10f*sinf(time*.117f-z*.031f))*(${oceanBands.map(b=>{
 const scale=axis==='height'?1:Math.sqrt(9.81/OCEAN.depth)*(axis==='x'?Math.cos(b.angle):Math.sin(b.angle));
 return `${f(b.amplitude*scale)}f*cosf(${f(b.kx)}f*x+${f(b.kz)}f*z-${f(b.omega)}f*time+${f(b.phase)}f)`;
}).join('+')});}`).join('\n');
export const oceanWgsl=`fn offshore(p:vec2f)->vec3f {var result=vec3f(0.);${oceanBands.map(b=>`
 {let phase=dot(p,vec2f(${f(b.kx)},${f(b.kz)}))-${f(b.omega)}*cam.eye.w+${f(b.phase)};
 result+=vec3f(cos(phase)*${f(b.amplitude)},-sin(phase)*vec2f(${f(b.amplitude*b.kx)},${f(b.amplitude*b.kz)}));}`).join('')}
 let group=.79+.16*sin(cam.eye.w*.071+p.y*.018)+.10*sin(cam.eye.w*.117-p.y*.031);
 let groupZ=.16*.018*cos(cam.eye.w*.071+p.y*.018)-.10*.031*cos(cam.eye.w*.117-p.y*.031);
 result=vec3f(result.x*group,result.y*group,result.z*group+result.x*groupZ);
 return result*isle.weather.y+vec3f(isle.weather.x,0.,0.);}`;
