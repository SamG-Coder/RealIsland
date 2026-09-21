// RealIsland's shared world. Upstream river helpers and Saltreach's beach
// profile are linked immediately before this file. Units are metres/seconds.
__device__ float islandNoise(const float *World, float x, float z) {
  int ix=(int)floorf(x), iz=(int)floorf(z);
  float fx=x-(float)ix, fz=z-(float)iz; fx=fx*fx*(3.0f-2.0f*fx); fz=fz*fz*(3.0f-2.0f*fz);
  int seed=(int)World[0]*1013;
  float a=worldHash(ix*7919+iz*104729+seed), b=worldHash((ix+1)*7919+iz*104729+seed);
  float c=worldHash(ix*7919+(iz+1)*104729+seed), d=worldHash((ix+1)*7919+(iz+1)*104729+seed);
  return (a+(b-a)*fx)*(1.0f-fz)+(c+(d-c)*fx)*fz;
}
__device__ float islandRadius(const float *World, float a) {
  float phase=worldHash((int)World[0]+87)*1.6f;
  return 1008.0f*(1.0f+.13f*sinf(3.0f*a+phase)+.085f*cosf(5.0f*a-phase)+.028f*sinf(9.0f*a));
}
__device__ float shoreDistance(const float *World, float x, float z) {
  float xx=x/.88f, zz=z+260.0f;
  return sqrtf(xx*xx+zz*zz)-islandRadius(World,atan2f(zz,xx));
}
__device__ float islandPeak(float x,float z,float px,float pz,float rx,float rz,float height) {
  float a=(x-px)/rx,b=(z-pz)/rz; return height*expf(-a*a-b*b);
}
__device__ float riverGround(const float *World,float x,float z) {
  float coast=shoreDistance(World,x,z), inland=smooth(-15.0f,-150.0f,coast);
  // Long ridges share the valley's north-south orientation. No isolated bumps
  // under a separately laid-out river; the valley floor owns its catchment.
  float hills=islandPeak(x,z,-510.0f,-590.0f,270.0f,480.0f,220.0f)
    +islandPeak(x,z,130.0f,-490.0f,250.0f,420.0f,190.0f)
    +islandPeak(x,z,-250.0f,-1000.0f,430.0f,200.0f,175.0f)
    +islandPeak(x,z,-240.0f,160.0f,230.0f,300.0f,90.0f)
    +islandPeak(x,z,520.0f,300.0f,280.0f,220.0f,65.0f);
  float broad=islandNoise(World,x*.003f,z*.003f);
  float ridges=1.0f-fabsf(islandNoise(World,x*.009f,z*.006f)*2.0f-1.0f);
  float detail=(islandNoise(World,x*.025f,z*.025f)-.5f)*7.0f
    +(islandNoise(World,x*.09f,z*.09f)-.5f)*1.2f;
  hills*=.82f+broad*.25f;
  hills+=ridges*24.0f*smooth(25.0f,100.0f,hills)+detail;
  // Sheltered southern coves have beaches; bedrock shoulders approach the
  // exposed coast. The same field extends continuously into the seabed.
  float exposure=smooth(.0f,.65f,-x/1008.0f)*(1.0f-smooth(350.0f,650.0f,z));
  float shore=shoreProfile(coast,z*.25f);
  float terrain=shore+hills*inland+exposure*18.0f*smooth(5.0f,-65.0f,coast);
  float center=riverCenter(World,z), width=riverWidth(World,z);
  float distance=fabsf(x-center), bank=fmaxf(0.0f,distance-width);
  float t=cap((z+600.0f)/1360.0f,0.0f,1.0f), level=riverDatum(World,x,z);
  float thalweg=level-(.22f+.10f*t+.65f*smooth(.80f,1.0f,t));
  // A curved cross-section, low gravel banks, then valley sides. Increasing
  // downstream width and reducing slope provide a gradual tidal transition.
  float valley=thalweg+.95f*powf(fminf(distance/width,1.0f),2.0f)
    +bank*(.30f-.16f*t)+powf(bank*.012f,1.65f);
  float reach=smooth(-680.0f,-600.0f,z)*(1.0f-smooth(820.0f,960.0f,z));
  float corridor=(1.0f-smooth(width+25.0f,width+180.0f,distance))*reach;
  // Raise any accidental depression below the intended bank before incising.
  // Thus the river cannot be perched above a randomly lower adjacent hillside.
  terrain+=(fmaxf(terrain,level+2.0f)-terrain)*corridor;
  terrain=terrain+(fminf(terrain,valley)-terrain)*corridor;
  // A finite headwater lake, with a low southern spillway into the valley.
  // It holds initial storage; the boundary never clamps its surface level.
  float lx=(x+280.0f)/72.0f,lz=(z+690.0f)/90.0f;
  float lakeRadius=sqrtf(lx*lx+lz*lz);
  float lakeBed=18.39f-4.0f+4.3f*powf(lakeRadius,4.0f);
  terrain+=(fminf(terrain,lakeBed)-terrain)*(1.0f-smooth(1.8f,2.3f,lakeRadius));
  return fmaxf(-24.0f,terrain);
}
// ISLAND_KERNELS
// Scroll the resident fine grid on integer cells. Overlap is copied exactly;
// newly visible water inherits the live island state, never time-zero waves.
__global__ void scrollWater(const float *S,const float *Aux,const float *Coarse,const float *World,const float *R,const float *CoarseEta,float *Scroll,float *ScrollAux,int nx,int nz,float x0,float z0,float dx,float dz,int cnx,int cnz,float cx0,float cz0,float cdx,float cdz,int shiftX,int shiftZ,int reset){
 int k=blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
 int i=k%nx,j=k/nx,oi=i+shiftX,oj=j+shiftZ;
 int overlap=reset==0&&oi>=0&&oi<nx&&oj>=0&&oj<nz;
 float x=x0+(float)i*dx,z=z0+(float)j*dz;
 for(int layer=0;layer<19;layer++){
   float v=0.0f;
   if(overlap)v=S[layer*n+oj*nx+oi];
   else if(layer<11)v=cachedField(Coarse,cnx,cnz,cx0,cz0,cdx,cdz,x,z,layer);
   Scroll[layer*n+k]=v;
 }
 if(!overlap){
  float ground=Scroll[n+k],bed=ground;
  for(int r=0;r<105;r++){
   int o=r*8;
   if(fabsf(x-R[o])<R[o+2]*1.4f&&fabsf(z-R[o+1])<R[o+3]*1.4f)bed=fmaxf(bed,cachedRock(World,R,r,x,z,ground)-.035f);
  }
  float level=cachedField(CoarseEta,cnx,cnz,cx0,cz0,cdx,cdz,x,z,0);
  float parentDepth=cachedField(Coarse,cnx,cnz,cx0,cz0,cdx,cdz,x,z,2);
  Scroll[k]=bed;Scroll[2*n+k]=parentDepth>.0005f?fmaxf(0.0f,level-bed):0.0f;
 }
 for(int layer=0;layer<4;layer++)ScrollAux[layer*n+k]=overlap?Aux[layer*n+oj*nx+oi]:0.0f;
}
__global__ void commitScroll(float *S,float *Aux,const float *Scroll,const float *ScrollAux,int nx,int nz){
 int k=blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
 for(int layer=0;layer<19;layer++)S[layer*n+k]=Scroll[layer*n+k];
 for(int layer=0;layer<4;layer++)Aux[layer*n+k]=ScrollAux[layer*n+k];
}
// Saltreach impact thresholds, particle kinds, lifetime and launch model,
// adapted to the island's rock descriptors and local shore orientation.
__global__ void coastalImpact(const float *World,const float *S,const float *Eta,const float *R,const float *Controls,float *RockState,float *Particles,int nx,int nz,int rockCount,int slots,int step,float x0,float z0,float dx,float dz,float time){
 int r=blockIdx.x*blockDim.x+threadIdx.x;if(r>=rockCount)return;
 int o=r*8,a=r*8,n=nx*nz;
 float rx=R[o],rz=R[o+1],radius=fmaxf(R[o+2],R[o+3]);
 if(R[o+5]<-5.0f||R[o+5]>2.0f||rx<x0+radius*2.0f||rx>x0+(float)(nx-1)*dx-radius*2.0f||rz<z0+radius*2.0f||rz>z0+(float)(nz-1)*dz-radius*2.0f){RockState[a+1]=0.0f;return;}
 float ex=.5f;
 float gx=cachedField(S,nx,nz,x0,z0,dx,dz,rx+ex,rz,1)-cachedField(S,nx,nz,x0,z0,dx,dz,rx-ex,rz,1);
 float gz=cachedField(S,nx,nz,x0,z0,dx,dz,rx,rz+ex,1)-cachedField(S,nx,nz,x0,z0,dx,dz,rx,rz-ex,1);
 float norm=fmaxf(.001f,sqrtf(gx*gx+gz*gz)),ux=gx/norm,uz=gz/norm;
 float x=rx-ux*radius*1.1f,z=rz-uz*radius*1.1f;
 float level=sampleScalar(Eta,x,z,nx,nz,x0,z0,dx,dz);
 float bed=sampleScalar(S,x,z,nx,nz,x0,z0,dx,dz),depth=level-bed;
 float speed=sampleScalar(S+3*n,x,z,nx,nz,x0,z0,dx,dz)*ux+sampleScalar(S+4*n,x,z,nx,nz,x0,z0,dx,dz)*uz;
 float elapsed=time-RockState[a+1],rise=(level-RockState[a])/fmaxf(.02f,elapsed);
 if(RockState[a+1]>0.0f&&elapsed<.25f&&depth>.08f&&speed>.45f&&rise>.045f&&time-RockState[a+2]>.5f&&R[o+5]+R[o+4]>level+.15f){
  float force=cap(speed*.65f+fmaxf(rise,0.0f)*.3f,.4f,2.8f);
  int amount=min(slots/2,(int)(60.0f+force*55.0f*Controls[0])),cursor=(int)RockState[a+6];
  float contact=radius*1.5f;
  for(int b=0;b<32;b++){
   float px=rx-ux*contact,pz=rz-uz*contact;
   if(cachedRock(World,R,r,px,pz,cachedField(S,nx,nz,x0,z0,dx,dz,px,pz,1))>level)break;
   contact-=radius*.05f;
  }
  for(int j=0;j<amount;j++){
   unsigned int seed=(unsigned int)(r*7919+step*173+j*37);float spread=randomSpray(seed)-.5f;
   float xx=rx-ux*(contact+.06f+randomSpray(seed+8u)*.12f)-uz*spread*radius*.9f;
   float zz=rz-uz*(contact+.06f+randomSpray(seed+8u)*.12f)+ux*spread*radius*.9f;
   float kind=j%4==0?1.0f:j%4==1?2.0f:0.0f,mist=kind==1.0f?1.0f:0.0f;
   float launch=(4.0f+force*4.0f)*(.58f+randomSpray(seed+3u)*.62f),outward=.3f+randomSpray(seed+2u)*force*.8f;
   int p=(r*slots+cursor)*12;
   Particles[p]=xx;Particles[p+1]=fmaxf(level+.035f,cachedRock(World,R,r,xx,zz,cachedField(S,nx,nz,x0,z0,dx,dz,xx,zz,1))+.03f);Particles[p+2]=zz;
   Particles[p+3]=time+randomSpray(seed+6u)*.13f;Particles[p+4]=.55f+launch*.12f+mist*.4f;
   Particles[p+5]=-ux*outward-uz*spread*(1.5f+force);Particles[p+6]=launch;Particles[p+7]=-uz*outward+ux*spread*(1.5f+force);
   Particles[p+8]=mist>0?.25f+randomSpray(seed+5u)*.25f:kind>1.0f?.10f+randomSpray(seed+5u)*.12f:.018f+randomSpray(seed+5u)*.045f;
   Particles[p+9]=kind;Particles[p+10]=randomSpray(seed+7u);Particles[p+11]=level;cursor=(cursor+1)%slots;
  }
  RockState[a+5]+=(float)amount;RockState[a+6]=(float)cursor;RockState[a+2]=time;
 }
 RockState[a]=level;RockState[a+1]=time;RockState[a+3]=fmaxf(RockState[a+3]-.008f*fmaxf(0.0f,elapsed),level+.07f);
}
// Nested-grid exchange. Parent provides the boundary water level/current;
// the fine coastal solution publishes back into covered parent cells.
// This is state coupling, not a claim of conservative AMR flux refluxing.
__global__ void coastalPatchBoundary(float *S,const float *Coarse,const float *Controls,int nx,int nz,float x0,float z0,float dx,float dz,int cnx,int cnz,float cx0,float cz0,float cdx,float cdz,float dt,float time,float flow){
 int k=blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
 int i=k%nx,j=k/nx;float edge=(float)min(min(i,nx-1-i),min(j,nz-1-j));
 float blend=(1.0f-smooth(1.0f,24.0f,edge))*(1.0f-expf(-dt*18.0f));
 float x=x0+(float)i*dx,z=z0+(float)j*dz;
 float level=cachedField(Coarse,cnx,cnz,cx0,cz0,cdx,cdz,x,z,0)+cachedField(Coarse,cnx,cnz,cx0,cz0,cdx,cdz,x,z,2);
 float parentDepth=cachedField(Coarse,cnx,cnz,cx0,cz0,cdx,cdz,x,z,2);
 float target=parentDepth>.0005f?fmaxf(0.0f,level-S[k]):0.0f;
 S[2*n+k]=fmaxf(0.0f,S[11*n+k]+(target-S[11*n+k])*blend);
 for(int layer=3;layer<=6;layer++)S[layer*n+k]+=(cachedField(Coarse,cnx,cnz,cx0,cz0,cdx,cdz,x,z,layer)-S[layer*n+k])*blend;
 float shelfSlope=i>0&&i<nx-1?(S[n+k+1]-S[n+k-1])/(2.0f*dx):0.0f;
 float generation=smooth(4.0f,8.0f,Controls[2]-S[n+k])*smooth(.004f,.03f,shelfSlope);
 float forcing=1.0f-expf(-dt*generation*6.0f);
 float wave=oceanheight(x,z,time,Controls[0]);
 S[2*n+k]+=(fmaxf(0.0f,Controls[2]+wave-S[k])-S[2*n+k])*forcing;
 float shoal=sqrtf(24.0f/fmaxf(.45f,Controls[2]-S[k]));
 S[3*n+k]+=(oceanx(x,z,time,Controls[0])*shoal-S[3*n+k])*forcing;
 S[4*n+k]+=(oceanz(x,z,time,Controls[0])*shoal-S[4*n+k])*forcing;
 // The resident grid must retain the same volumetric headwater supply when
 // viewing the lake. Convert parent depth rate to this grid's cell area.
 int si=(int)floorf((-280.0f-x0)/dx+.5f),sj=(int)floorf((-690.0f-z0)/dz+.5f);
 if(i==si&&j==sj&&edge>24.0f)S[2*n+k]+=dt*Controls[1]*cdx*cdz/(dx*dz)*fmaxf(0.0f,flow);

}
__global__ void exchangeCoastalPatch(const float *S,float *Coarse,int nx,int nz,float x0,float z0,float dx,float dz,int cnx,int cnz,float cx0,float cz0,float cdx,float cdz){
 int k=blockIdx.x*blockDim.x+threadIdx.x,n=cnx*cnz;if(k>=n)return;
 float x=cx0+(float)(k%cnx)*cdx,z=cz0+(float)(k/cnx)*cdz;
 float edge=fminf(fminf(x-x0,x0+(float)(nx-1)*dx-x),fminf(z-z0,z0+(float)(nz-1)*dz-z));
 if(edge<8.0f)return;float blend=smooth(8.0f,16.0f,edge);
 float level=cachedField(S,nx,nz,x0,z0,dx,dz,x,z,0)+cachedField(S,nx,nz,x0,z0,dx,dz,x,z,2);
 float fineDepth=cachedField(S,nx,nz,x0,z0,dx,dz,x,z,2);
 float target=fineDepth>.0005f?fmaxf(0.0f,level-Coarse[k]):0.0f;Coarse[2*n+k]+=(target-Coarse[2*n+k])*blend;
 for(int layer=3;layer<=8;layer++)Coarse[layer*n+k]+=(cachedField(S,nx,nz,x0,z0,dx,dz,x,z,layer)-Coarse[layer*n+k])*blend;
}
__global__ void initializeIsland(const float *World,const float *R,float *S,int nx,int nz,float x0,float z0,float dx,float dz,int start) {
  int k=start+blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
  float x=x0+(float)(k%nx)*dx,z=z0+(float)(k/nx)*dz;
  float ground=riverGround(World,x,z),bed=ground;
  S[k]=bed;S[n+k]=ground;
  float level=0.0f, current=0.0f;
  if(z>-625.0f&&z<850.0f&&channelDistance(World,x,z)<6.0f) {
    level=fmaxf(0.0f,riverDatum(World,x,z)); current=.25f;
  }
  float lx=(x+280.0f)/72.0f,lz=(z+690.0f)/90.0f;
  if(lx*lx+lz*lz<1.0f){level=18.39f;current=0.0f;}
  float oceanU=0.0f,oceanV=0.0f;
  if(level<.001f && ground<0.0f){
    float fade=smooth(.02f,2.0f,-ground);
    level+=oceanheight(x,z,0.0f,1.0f)*fade;
    oceanU=oceanx(x,z,0.0f,1.0f)*fade;
    oceanV=oceanz(x,z,0.0f,1.0f)*fade;
  }
  float h=fmaxf(0.0f,level-bed), tangent=(riverCenter(World,z+.25f)-riverCenter(World,z-.25f))/.5f;
  S[2*n+k]=h;
  S[4*n+k]=h>.02f?current/sqrtf(1.0f+tangent*tangent)+oceanV:0.0f;
  S[3*n+k]=(S[4*n+k]-oceanV)*tangent+oceanU;
  S[7*n+k]=h>.002f?1.0f:0.0f;S[8*n+k]=fminf(1.0f,h*5.0f);
  S[9*n+k]=x;S[10*n+k]=z;
}
__global__ void islandBoundary(const float *World,float *S,const float *Controls,int nx,int nz,float x0,float z0,float dx,float dz,float dt,float time,float flow,int closed) {
  int k=blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
  int i=k%nx,j=k/nx;float depth=S[11*n+k];
  if(closed==0){
    float x=x0+(float)i*dx,z=z0+(float)j*dz, tide=Controls[2];
    float edge=fminf(fminf((float)i*dx,(float)(nx-1-i)*dx),fminf((float)j*dz,(float)(nz-1-j)*dz));
    float sponge=1.0f-smooth(4.0f,55.0f,edge);
    // Offshore spectrum -> resolved surf. Inject on the exposed deep shelf,
    // rather than attenuating the swell across kilometres of shallow-water grid.
    float shelfSlope=i>0&&i<nx-1?(S[n+k+1]-S[n+k-1])/(2.0f*dx):0.0f;
    float generation=smooth(4.0f,8.0f,tide-S[n+k])*smooth(.004f,.03f,shelfSlope);
    sponge=fmaxf(sponge,generation);
    if(sponge>0.0f){
      float target=fmaxf(0.0f,tide+oceanheight(x,z,time,Controls[0])-S[k]);
      float blend=1.0f-expf(-dt*sponge*6.0f);
      depth+=(target-depth)*blend;
      S[3*n+k]+=(oceanx(x,z,time,Controls[0])*sqrtf(24.0f/fmaxf(.45f,tide-S[k]))-S[3*n+k])*blend;
      S[4*n+k]+=(oceanz(x,z,time,Controls[0])*sqrtf(24.0f/fmaxf(.45f,tide-S[k]))-S[4*n+k])*blend;
    }
    // Explicit spring discharge: catchment runoff / source-cell area (m/s).
    // Add volume, never force a water level or inject an arbitrary velocity.
    int sourceI=(int)floorf((-280.0f-x0)/dx+.5f),sourceJ=(int)floorf((-690.0f-z0)/dz+.5f);
    if(i==sourceI&&j==sourceJ)depth+=dt*Controls[1]*fmaxf(0.0f,flow);
    if(depth<.0015f)depth*=expf(-dt*1.5f);
  }
  S[2*n+k]=fmaxf(0.0f,depth);
}
__global__ void islandTerrain(const float *S,float *Terrain,int nx,int nz,float x0,float z0,float dx,float dz,int start){
  int k=start+blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
  int i=k%nx,j=k/nx,l=j*nx+max(0,i-1),r=j*nx+min(nx-1,i+1),b=max(0,j-1)*nx+i,f=min(nz-1,j+1)*nx+i;
  float gx=(S[n+r]-S[n+l])/(i>0&&i<nx-1?2.0f*dx:dx),gz=(S[n+f]-S[n+b])/(j>0&&j<nz-1?2.0f*dz:dz);
  Terrain[k*8]=x0+(float)i*dx;Terrain[k*8+1]=S[n+k];Terrain[k*8+2]=z0+(float)j*dz;Terrain[k*8+3]=0.0f;
  Terrain[k*8+4]=-gx;Terrain[k*8+5]=1.0f;Terrain[k*8+6]=-gz;Terrain[k*8+7]=0.0f;
}
// Ocean extension is outside the simulated square only; its inner edge matches
// the mean sea level. It is visual far-field, never counted as simulated volume.
__global__ void initializeClosedTest(float *S,int nx,int nz,float dx,float dz,int mode){
  int k=blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
  float x=(float)(k%nx)*dx,z=(float)(k/nx)*dz;
  float bed=mode==0?-.9f:-1.0f+.12f*sinf(x*.3f)*cosf(z*.21f);
  S[k]=bed;S[n+k]=bed;S[2*n+k]=-bed;
  if(mode==0){float a=(x-(float)nx*dx*.5f)/3.0f,b=(z-(float)nz*dz*.5f)/3.0f;S[2*n+k]+=.12f*expf(-a*a-b*b);}
  S[9*n+k]=x;S[10*n+k]=z;
}

// One bounded patch per rock. Ordered GPU dispatches preserve overlapping
// obstacle maxima without atomic floats or a per-cell all-rock traversal.
__global__ void applyIslandRocks(const float *World,const float *R,float *S,int nx,int nz,float x0,float z0,float dx,float dz,int rockIndex){
 int k=blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz,a=rockIndex*8;
 float radius=fmaxf(R[a+2],R[a+3])*1.4f;
 int ix=max(0,(int)floorf((R[a]-radius-x0)/dx)),iz=max(0,(int)floorf((R[a+1]-radius-z0)/dz));
 int ex=min(nx-1,(int)ceilf((R[a]+radius-x0)/dx)),ez=min(nz-1,(int)ceilf((R[a+1]+radius-z0)/dz));
 int cols=ex-ix+1,rows=ez-iz+1;if(cols<1||rows<1||k>=cols*rows)return;
 int i=ix+k%cols,j=iz+k/cols,q=j*nx+i;
 float x=x0+(float)i*dx,z=z0+(float)j*dz;
 float ground=S[n+q],level=S[q]+S[2*n+q];
 float bed=fmaxf(S[q],cachedRock(World,R,rockIndex,x,z,ground));
 S[q]=bed;S[2*n+q]=fmaxf(0.0f,level-bed);
 if(S[2*n+q]<.002f){S[3*n+q]=0.0f;S[4*n+q]=0.0f;S[7*n+q]=0.0f;S[8*n+q]=0.0f;}
}

// Each radial limb carries connected wood and two feathered branchlet planes.
// The crown follows the supplied conifer reference: layered, tapered and drooping.
__global__ void forestVertices(const float *World,const float *Trees,float *Foliage,int count,int start){
 int k=start+blockIdx.x*blockDim.x+threadIdx.x;if(k>=count)return;
 int card=k/4,corner=k%4,t=card/192,b=card%192;
 float tx=Trees[t*4],ty=Trees[t*4+1],tz=Trees[t*4+2],h=Trees[t*4+3];
 float up=corner==1||corner==2?1.0f:0.0f,side=corner>=2?1.0f:-1.0f;
 float seed=randomRiver(World,t+11041),x=tx,y=ty,z=tz,nx=0.0f,ny=1.0f,nz=0.0f,material=seed,f=0.0f;
 if(b>=184){
  float angle=((float)(b-184)+(corner>=2?1.0f:0.0f))*.78539816f;
  float rad=h*(up>.5f?.0008f:.019f);
  x+=cosf(angle)*rad;z+=sinf(angle)*rad;y+=up*h*1.025f-.25f;
  nx=cosf(angle);ny=.025f;nz=sinf(angle);material=-1.0f;
 }else{
  int branch=b/2,plane=b%2;
  float rnd=randomRiver(World,t*53+branch+417);
  f=.075f+(float)branch*.0099f+(rnd-.5f)*.018f;
  float a=(float)branch*2.399963f+seed*6.283185f+(rnd-.5f)*.4f;
  float reach=h*(.29f+.035f*seed)*powf(1.0f-f,.86f)*(.82f+.30f*rnd);
  float drop=reach*.06f*f;
  float width=reach*.46f;
  float roll=plane==0?.25f:-1.0f;
  float across=side*width,vertical=across*sinf(roll);
  material=seed*.4f+rnd*.6f;
  x+=cosf(a)*up*reach-sinf(a)*across*cosf(roll);
  z+=sinf(a)*up*reach+cosf(a)*across*cosf(roll);
  y+=h*f+up*drop+vertical;
  nx=sinf(a)*sinf(roll);ny=cosf(roll);nz=-cosf(a)*sinf(roll);
 }
 Foliage[k*8]=x;Foliage[k*8+1]=y;Foliage[k*8+2]=z;Foliage[k*8+3]=material;
 Foliage[k*8+4]=nx;Foliage[k*8+5]=ny;Foliage[k*8+6]=nz;Foliage[k*8+7]=f;
}
