// Explicit validation only: inspect the actual GPU bed/depth readback.
// No analytic river formula is copied here; find the valley's lowest bed.
export function auditWatershed(state,grid) {
  const {nx,nz,x0,z0,dx,dz}=grid,n=nx*nz;
  const profile=[];let previousX=null;
  for(let j=Math.ceil((-585-z0)/dz);j<=Math.floor((790-z0)/dz);j++){
    let best=Infinity,index=-1;
    for(let i=Math.ceil(((previousX===null?-400:previousX-30)-x0)/dx);i<=Math.floor(((previousX===null?400:previousX+30)-x0)/dx);i++){
      const k=j*nx+i;
      if(previousX===null){
        // Locate the high, wet headwater rather than a lower unrelated dry valley.
        if(state[2*n+k]>.05 && (index<0 || state[n+k]+state[2*n+k]>state[n+index]+state[2*n+index])){best=state[n+k];index=k;}
      }else if(state[n+k]<best){best=state[n+k];index=k;}
    }
    if(index<0)break;
    previousX=x0+(index%nx)*dx;
    profile.push({z:z0+j*dz,bed:best,depth:state[2*n+index],index});
  }
  let uphill=0;
  for(let i=1;i<profile.length;i++)uphill=Math.max(uphill,profile[i].bed-profile[i-1].bed);
  const visited=new Uint8Array(n),queue=new Int32Array(n);
  let head=0,tail=0,reachesOcean=false;
  const source=profile[0]?.index;
  if(source>=0 && state[2*n+source]>.01){queue[tail++]=source;visited[source]=1;}
  while(head<tail){
    const k=queue[head++],i=k%nx,j=Math.floor(k/nx);
    if((i===0||j===0||i===nx-1||j===nz-1)&&state[k]<-5){reachesOcean=true;break;}
    for(const [a,b] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]){
      const x=i+a,z=j+b;if(x<0||z<0||x>=nx||z>=nz)continue;
      const q=z*nx+x;if(!visited[q]&&state[2*n+q]>.01){visited[q]=1;queue[tail++]=q;}
    }
  }
  let land=0,minBed=Infinity,maxBed=-Infinity;
  for(let k=0;k<n;k++){minBed=Math.min(minBed,state[n+k]);maxBed=Math.max(maxBed,state[n+k]);if(state[n+k]>0)land++;}
  return {sourceBed:profile[0]?.bed,outletBed:profile.at(-1)?.bed,maxUphillStep:uphill,reachesOcean,
    landAreaKm2:land*dx*dz/1e6,minBed,maxBed,profile:profile.filter((_,i)=>i%8===0),
    pass:reachesOcean && uphill<.25 && minBed<-20 && maxBed>150 && land*dx*dz>1e6};
}
