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
  return 252.0f*(1.0f+.082f*sinf(3.0f*a+phase)+.042f*cosf(5.0f*a-phase)+.032f*sinf(7.0f*a));
}
__device__ float shoreDistance(const float *World, float x, float z) {
  float xx=x/.88f, zz=z+65.0f;
  return sqrtf(xx*xx+zz*zz)-islandRadius(World,atan2f(zz,xx));
}
__device__ float islandPeak(float x,float z,float px,float pz,float rx,float rz,float height) {
  float a=(x-px)/rx,b=(z-pz)/rz; return height*expf(-a*a-b*b);
}
__device__ float riverGround(const float *World,float x,float z) {
  float coast=shoreDistance(World,x,z), inland=smooth(-12.0f,-72.0f,coast);
  float hills=islandPeak(x,z,-77.0f,-155.0f,82.0f,92.0f,63.0f)
    +islandPeak(x,z,82.0f,-106.0f,75.0f,116.0f,52.0f)
    +islandPeak(x,z,8.0f,-234.0f,78.0f,65.0f,48.0f)
    +islandPeak(x,z,-104.0f,15.0f,60.0f,74.0f,28.0f)
    +islandPeak(x,z,105.0f,68.0f,55.0f,56.0f,17.0f);
  float broad=islandNoise(World,x*.025f,z*.025f), fine=islandNoise(World,x*.105f,z*.105f);
  hills*=.80f+broad*.34f;
  hills+=(fine-.5f)*4.0f+(islandNoise(World,x*.31f,z*.31f)-.5f)*.9f;
  float terrain=shoreProfile(coast,z)+hills*inland;
  float channel=channelDistance(World,x,z), river=valleyGround(World,x,z);
  float corridor=(1.0f-smooth(24.0f,62.0f,channel))*smooth(-169.0f,-153.0f,z)*(1.0f-smooth(187.0f,227.0f,z));
  // The estuary is the same bed/grid as the sea, not a separate water plane.
  river=fminf(river, -1.15f+powf(fmaxf(0.0f,fabsf(x-riverCenter(World,z))-(12.0f+smooth(145.0f,215.0f,z)*18.0f)),.82f)*.83f
      +fmaxf(0.0f,riverDatum(World,x,z)));
  terrain=terrain+(fminf(terrain,river)-terrain)*corridor;
  return fmaxf(-24.0f,terrain);
}
// ISLAND_KERNELS
__global__ void initializeIsland(const float *World,const float *R,float *S,int nx,int nz,float x0,float z0,float dx,float dz,int start) {
  int k=start+blockIdx.x*blockDim.x+threadIdx.x,n=nx*nz;if(k>=n)return;
  float x=x0+(float)(k%nx)*dx,z=z0+(float)(k/nx)*dz;
  float ground=riverGround(World,x,z),bed=ground;
  S[k]=bed;S[n+k]=ground;
  float level=0.0f, current=0.0f;
  if(z>-156.0f&&z<185.0f&&channelDistance(World,x,z)<4.0f) {
    level=fmaxf(0.0f,riverDatum(World,x,z)); current=3.2f;
  }
  float oceanU=0.0f,oceanV=0.0f;
  if(level<.001f && ground<0.0f){
    float wave=0.0f,fade=smooth(.02f,1.4f,-ground);
    for(int b=0;b<4;b++){
      float kappa=6.2831853f/(32.0f+(float)b*11.0f),angle=-.55f+(float)b*.34f;
      float band=cosf(kappa*(cosf(angle)*x+sinf(angle)*z)+(float)b*2.399963f)*(.20f/(1.0f+(float)b*.6f))*fade;
      wave+=band;float velocity=band*sqrtf(9.81f/fmaxf(.45f,-ground));
      oceanU+=cosf(angle)*velocity;oceanV+=sinf(angle)*velocity;
    }
    level+=wave;
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
    if(sponge>0.0f){
      float wave=0.0f;
      for(int b=0;b<4;b++){
        float wavelength=32.0f+(float)b*11.0f,kappa=6.2831853f/wavelength;
        float angle=-.55f+(float)b*.34f;
        float phase=kappa*(cosf(angle)*x+sinf(angle)*z)-sqrtf(9.81f*kappa)*time+(float)b*2.399963f;
        wave+=cosf(phase)*(.20f/(1.0f+(float)b*.6f));
      }
      float target=fmaxf(0.0f,tide+wave*Controls[0]-S[k]), blend=1.0f-expf(-dt*sponge*6.0f);
      depth+=(target-depth)*blend;
      float speed=wave*Controls[0]*sqrtf(9.81f/fmaxf(.45f,tide-S[k]));
      S[3*n+k]+=(speed*.94f-S[3*n+k])*blend;S[4*n+k]+=(speed*-.34f-S[4*n+k])*blend;
    }
    // Explicit spring discharge is the only inland volume source.
    float spring=(1.0f-smooth(1.8f,5.8f,fabsf(z+150.0f)))*(1.0f-smooth(-2.0f,1.0f,channelDistance(World,x,z)));
    if(spring>0.0f){
      float blend=1.0f-expf(-dt*spring*12.0f),target=fmaxf(0.0f,riverDatum(World,x,z)-S[k]);
      depth+=(target-depth)*blend;
      S[4*n+k]+=(3.2f*flow-S[4*n+k])*blend;
      float tangent=(riverCenter(World,z+.25f)-riverCenter(World,z-.25f))/.5f;
      S[3*n+k]+=(3.2f*flow*tangent-S[3*n+k])*blend;
    }
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
