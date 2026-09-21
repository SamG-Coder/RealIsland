export function actorPoses(state,resources,motion){
 const out=[];
 for(const r of resources)if((state.harvested[r.id]||0)<=state.elapsed){
  out.push(r.x,r.y+.35,r.z,6,.5,.42,.45,0,0,0,0,0);
  for(let i=0;i<4;i++){const a=i*2.4;out.push(r.x+Math.cos(a)*.38,r.y+.44+(i%2)*.12,r.z+Math.sin(a)*.35,7,.055,.06,.055,0,0,0,0,0);}
 }
 return new Float32Array(out);
}
