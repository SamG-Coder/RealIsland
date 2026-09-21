import {cameraBasis,look} from '../vendor/realgrass/src/camera.js';
export {cameraBasis};
export const VIEWS={
  island:{name:'Island overlook',position:[170,112,325],target:[0,16,-25]},
  river:{name:'Cascade walk',position:[-29,0,63],target:[2,8,20],groundOffset:2.1},
  meadow:{name:'Meadow',position:[-45,0,-53],target:[-14,21,-90],groundOffset:1.8},
  shore:{name:'Tidal beach',position:[-73,0,174],target:[8,.4,204],groundOffset:1.6},
  estuary:{name:'River mouth',position:[34,17,219],target:[0,1,155]}
};
export function pointCamera(camera,position,target){[camera.x,camera.y,camera.z]=position;const dx=target[0]-camera.x,dy=target[1]-camera.y,dz=target[2]-camera.z;camera.yaw=Math.atan2(dx,-dz);camera.pitch=Math.atan2(dy,Math.hypot(dx,dz));}
export function createCamera(canvas,onKey=()=>{}) {
 const camera={x:170,y:112,z:325,yaw:0,pitch:-.3},keys=new Set();pointCamera(camera,VIEWS.island.position,VIEWS.island.target);
 let dragging=false,lastX=0,lastY=0;
 canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);canvas.focus();});
 canvas.addEventListener('pointermove',e=>{if(!dragging)return;look(camera,e.clientX-lastX,e.clientY-lastY);lastX=e.clientX;lastY=e.clientY;});
 canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
 canvas.addEventListener('wheel',e=>{e.preventDefault();const b=cameraBasis(camera),speed=Math.sign(e.deltaY)*-8;camera.x+=b.forward[0]*speed;camera.y+=b.forward[1]*speed;camera.z+=b.forward[2]*speed;},{passive:false});
 addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(!e.repeat)onKey(e.code);});
 addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();dragging=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)keys.clear();});
 for(const button of document.querySelectorAll('[data-move]')){const key=button.dataset.move;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(key);});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(key));}
 return {camera,keys,update(dt){const b=cameraBasis(camera),forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),side=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),up=Number(keys.has('KeyE')||keys.has('Space'))-Number(keys.has('KeyQ')||keys.has('ControlLeft'));
 const direction=b.forward.map((v,i)=>v*forward+b.right[i]*side+(i===1?up:0));const speed=(keys.has('ShiftLeft')||keys.has('ShiftRight')?85:18)*Math.min(dt,.05)/Math.max(1,Math.hypot(...direction));camera.x+=direction[0]*speed;camera.y=Math.max(-10,camera.y+direction[1]*speed);camera.z+=direction[2]*speed;return cameraBasis(camera);}};
}
