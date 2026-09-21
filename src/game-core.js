export const SAVE_KEY='realisland-survival-v1';
export const SAVE_VERSION=1;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const finite=(x,a,b)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
export function decodeSave(raw){
 if(!raw)return null;const s=JSON.parse(raw);
 if(s.version!==SAVE_VERSION||!Number.isInteger(s.seed)||s.seed<0||s.seed>99999999||!s.player)throw Error('This save is incompatible.');
 const p=s.player;
 for(const key of ['x','z'])if(!finite(p[key],-1599,1599))throw Error('Invalid saved position.');
 if(!finite(p.y,-30,1000)||!finite(p.yaw,-1e6,1e6))throw Error('Invalid saved position.');
 for(const key of ['health','hunger','thirst','stamina'])if(!finite(p[key],0,100))throw Error('Invalid saved needs.');
 if(!finite(s.elapsed,0,1e9)||!Number.isInteger(s.berries)||s.berries<0||s.berries>9999)throw Error('Invalid saved inventory.');
 const harvested={};for(const [key,value] of Object.entries(s.harvested||{})){if(!/^berry-\d+$/.test(key)||!finite(value,0,1e9)||Object.keys(harvested).length>=64)throw Error('Invalid saved resources.');harvested[key]=value;}
 return {version:1,seed:s.seed,player:{...Object.fromEntries(['x','y','z','yaw','health','hunger','thirst','stamina'].map(k=>[k,p[k]])),vy:0,grounded:false},elapsed:s.elapsed,berries:s.berries,harvested,objectives:{gather:!!s.objectives?.gather,drink:!!s.objectives?.drink},savedAt:typeof s.savedAt==='string'?s.savedAt:''};
}
export function readSave(storage){try{return {save:decodeSave(storage.getItem(SAVE_KEY)),error:null};}catch(e){return {save:null,error:e.message};}}
export function writeSave(storage,state){const data={...state,version:1,savedAt:new Date().toISOString()};decodeSave(JSON.stringify(data));storage.setItem(SAVE_KEY,JSON.stringify(data));return data;}
export class CollisionWorld {
 constructor(grid,data,trees=new Float32Array()){
  this.grid=grid;this.data=data;this.trees=trees;this.tide=0;this.buckets=new Map();
  for(let i=0;i<trees.length;i+=4)if(trees[i+3]>0){const key=Math.floor(trees[i]/16)+','+Math.floor(trees[i+2]/16);if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push(i);}
 }
 sample(field,x,z){const detail=this.detail,inside=detail&&x>detail.grid.x0+1&&z>detail.grid.z0+1&&x<detail.grid.x0+(detail.grid.nx-1)*detail.grid.dx-1&&z<detail.grid.z0+(detail.grid.nz-1)*detail.grid.dz-1;const g=inside?detail.grid:this.grid,data=inside?detail.data:this.data,qx=clamp((x-g.x0)/g.dx,0,g.nx-1.001),qz=clamp((z-g.z0)/g.dz,0,g.nz-1.001),i=Math.floor(qx),j=Math.floor(qz),u=qx-i,v=qz-j,k=j*g.nx+i,a=data[field];return (a[k]*(1-u)+a[k+1]*u)*(1-v)+(a[k+g.nx]*(1-u)+a[k+g.nx+1]*u)*v;}
 height(x,z){return this.sample('bed',x,z);}
 water(x,z){const h=this.height(x,z),depth=this.sample('depth',x,z);return h<.6?Math.max(this.tide,h+depth):depth>.015?h+depth:-Infinity;}
 slope(x,z){const d=this.grid.dx;return [(this.height(x+d,z)-this.height(x-d,z))/(2*d),(this.height(x,z+d)-this.height(x,z-d))/(2*d)];}
 resolveTrunks(x,z,y){const bx=Math.floor(x/16),bz=Math.floor(z/16);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const i of this.buckets.get((bx+dx)+','+(bz+dz))||[]){const t=this.trees;if(y>t[i+1]+t[i+3]||y+1.8<t[i+1])continue;const a=x-t[i],b=z-t[i+2],d=Math.hypot(a,b),r=.32+t[i+3]*.019;if(d<r){x+=d>.0001?a/d*(r-d):r;z+=d>.0001?b/d*(r-d):0;}}return [x,z];}
 spawn(){let best=null,score=Infinity;const g=this.grid;for(let z=-240;z<120;z+=g.dz*2)for(let x=-250;x<100;x+=g.dx*2){const h=this.height(x,z);if(h<3||h>65||this.water(x,z)>h+.02||Math.hypot(...this.slope(x,z))>.35)continue;const [tx,tz]=this.resolveTrunks(x,z,h);if(Math.hypot(tx-x,tz-z)>.01)continue;let near=100;for(let d=-24;d<=24;d+=6){if(this.water(x+d,z)>this.height(x+d,z)+.06)near=Math.min(near,Math.abs(d));}const s=near*4+Math.abs(z+180)*.1+Math.abs(x+80)*.05;if(s<score){score=s;best={x,y:h+.04,z};}}
  if(!best)throw Error('No safe spawn found on this island.');return best;
 }
}
export function freshState(seed,spawn){return {version:1,seed,player:{...spawn,yaw:Math.PI,vy:0,grounded:true,health:100,hunger:85,thirst:85,stamina:100},elapsed:0,berries:0,harvested:{},objectives:{gather:false,drink:false}};}
export function stepPlayer(state,world,input,dt){
 const p=state.player;dt=clamp(dt,0,1/30);state.elapsed+=dt;
 const water=world.water(p.x,p.z),swimming=water-world.height(p.x,p.z)>1.05&&p.y<water-.4;
 const length=Math.hypot(input.x||0,input.z||0),moving=length>.001,sprint=!!input.sprint&&p.stamina>3&&!swimming&&moving;
 const speed=swimming?2: sprint?5.4:3.1;let vx=moving?(input.x||0)/Math.max(1,length)*speed:0,vz=moving?(input.z||0)/Math.max(1,length)*speed:0;
 if(moving)p.yaw=Math.atan2(vx,-vz);
 if(input.jump&&p.grounded&&!swimming&&p.stamina>8){p.vy=5.8;p.grounded=false;p.stamina-=8;}
 const oldGround=world.height(p.x,p.z),slope=world.slope(p.x,p.z);
 if(p.grounded&&Math.hypot(...slope)>.85){const uphill=vx*slope[0]+vz*slope[1],square=slope[0]**2+slope[1]**2;if(uphill>0){vx-=slope[0]*uphill/square;vz-=slope[1]*uphill/square;}}
 if(p.grounded&&Math.hypot(...slope)>.85){vx-=slope[0]*2;vz-=slope[1]*2;}
 let x=clamp(p.x+vx*dt,-1598,1598),z=clamp(p.z+vz*dt,-1598,1598);
 const canStep=(a,b)=>Math.max(world.height(a,b),world.height(a+.28,b),world.height(a-.28,b),world.height(a,b+.28),world.height(a,b-.28))<=Math.max(p.y+.36,oldGround+.12)||swimming;
 if(!canStep(x,p.z))x=p.x;if(!canStep(x,z))z=p.z;
 [x,z]=world.resolveTrunks(x,z,p.y);p.x=x;p.z=z;
 const ground=world.height(x,z),surface=world.water(x,z);p.swimming=surface-ground>1.05&&p.y<surface-.4;
 if(p.swimming){p.y+=(surface-.9-p.y)*Math.min(1,dt*8);p.vy=0;p.grounded=false;}
 else {if(p.grounded&&p.vy<=0&&ground>=p.y-.4)p.y=ground+.02;p.vy-=18*dt;p.y+=p.vy*dt;if(p.y<=ground+.02){if(p.vy<-9)p.health=clamp(p.health-(-p.vy-9)*4,0,100);p.y=ground+.02;p.vy=0;p.grounded=true;}else p.grounded=false;}
 p.stamina=clamp(p.stamina+(sprint?-14:9)*dt,0,100);p.hunger=clamp(p.hunger-dt*.035,0,100);p.thirst=clamp(p.thirst-dt*(sprint?.09:.055),0,100);
 if(p.hunger<=0||p.thirst<=0)p.health=clamp(p.health-dt*.8,0,100);
 return {speed:moving?speed:0,swimming:p.swimming};
}
export function makeResources(world,spawn,seed){const list=[];for(let i=0;i<24;i++){const angle=i*2.39996+seed*.01,r=i<5?4+i*2:18+(i%7)*5,x=spawn.x+Math.cos(angle)*r,z=spawn.z+Math.sin(angle)*r,y=world.height(x,z);if(world.water(x,z)>y+.02||Math.hypot(...world.slope(x,z))>.65)continue;list.push({id:'berry-'+i,x,y,z});}return list;}
export function interaction(state,world,resources){const p=state.player;let best=null,distance=2.2;for(const r of resources){const d=Math.hypot(p.x-r.x,p.z-r.z);if(d<distance&&Math.abs(p.y-r.y)<2&&(state.harvested[r.id]||0)<=state.elapsed){best={kind:'gather',resource:r,label:'Gather berries'};distance=d;}}
 if(best)return best;
 for(const [dx,dz] of [[0,0],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2],[2,0],[-2,0],[0,2],[0,-2]]){const x=p.x+dx,z=p.z+dz,h=world.height(x,z),w=world.water(x,z);if(h>1.4&&w>h+.04&&Math.abs(p.y-w)<2)return {kind:'drink',label:'Drink freshwater'};}
 return null;
}
export function useInteraction(state,action){if(!action)return false;if(action.kind==='gather'){state.berries+=3;state.harvested[action.resource.id]=state.elapsed+180;state.objectives.gather=true;}else if(action.kind==='drink'){state.player.thirst=100;state.objectives.drink=true;}return true;}
export function eat(state){if(state.berries<1||state.player.hunger>=100)return false;state.berries--;state.player.hunger=Math.min(100,state.player.hunger+18);state.player.thirst=Math.min(100,state.player.thirst+3);return true;}
