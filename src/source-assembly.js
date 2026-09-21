import {oceanCuda} from './ocean.js';
/** Link pinned upstream CUDA without editing the source submodules.
 * Every replacement is checked: an upstream change must fail loudly, not silently
 * build a different river. The output remains CUDA C, then uses the real compiler.
 */
export function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error(`Source adapter expected one occurrence: ${before.slice(0,100)}`);
  return source.replace(before, after);
}
export function cudaFunction(source, name) {
  const re = new RegExp(`__(?:device|global)__\\s+[\\w*]+\\s+${name}\\s*\\(`);
  const match = re.exec(source);
  if (!match) throw new Error(`Upstream CUDA function missing: ${name}`);
  const open = source.indexOf('{', match.index);
  let depth = 1, end = open + 1;
  for (; depth && end < source.length; end++) { if(source[end] === '{') depth++; if(source[end] === '}') depth--; }
  if(depth) throw new Error(`Unbalanced upstream function: ${name}`);
  return source.slice(match.index,end);
}
export function assembleSources({coast, coastRender, river, impacts, grass, plant, island, watershed}) {
  // Git may check out pinned sources with CRLF on Windows. Normalize before
  // applying exact adapters so the same commits produce identical CUDA.
  [coast, coastRender, river, impacts, grass, plant, island, watershed] =
    [coast, coastRender, river, impacts, grass, plant, island, watershed].map(s => s.replace(/\r\n?/g, '\n'));
  const take = name => cudaFunction(river,name);
  const helpers = ['worldHash','randomRiver','boundaryRandom','riverCenter','riverWidth','forkAmount','forkSide','branchCenter','channelDistance','ledgeStart','ledgeWidth','ledgeHeight','riverDatum','riverLevel','terrainNoise'].map(take).join('\n');
  let linked=helpers;
  for(const name of ['riverCenter','riverWidth','forkAmount','ledgeStart','ledgeWidth','ledgeHeight','riverDatum'])
    linked=replaceOnce(linked,take(name),cudaFunction(watershed,name));
  const valley = take('riverGround').replace('float riverGround(', 'float valleyGround(');
  let shore = cudaFunction(coastRender,'terrain').replace('float terrain(', 'float shoreProfile(');
  shore = replaceOnce(shore,'float d=x-(-1.7f+2.3f*sinf(z*.027f)+.00042f*z*z);','float d=x;');
  const [islandHelpers, islandKernels] = island.split('// ISLAND_KERNELS');
  if (!islandKernels) throw Error('Island CUDA marker missing');
  let rocks = take('initializeRocks');
  rocks = replaceOnce(rocks,'float z = 8.0f + randomRiver(World, k * 9 + 2) * 94.0f;', 'float z = -560.0f + randomRiver(World,k*9+2)*1220.0f;');
  rocks = replaceOnce(rocks,'  R[k * 8] = x;', `  // Keep the first 65 original river rocks; distribute the others on the coast.
  if(k<65){
    // Smaller, stream-aligned clasts downstream; isolated large blocks stay on banks.
    float downstream=cap((z+560.0f)/1220.0f,0.0f,1.0f);
    s*=k<20?.32f:.55f;
    s*=1.0f-.45f*downstream;
  }
  if (k >= 65) {
    float a = randomRiver(World, k * 41 + 371) * 6.2831853f;
    float radius = islandRadius(World, a) + (randomRiver(World,k+407)-.48f)*32.0f;
    x = cosf(a) * radius * .88f; z = sinf(a) * radius - 260.0f;
    s = 2.4f + randomRiver(World,k+503)*5.4f;
  }
  // Gravel and river blocks finish before the sandy tidal reach.
  s*=fmaxf(.001f,1.0f-smooth(400.0f,550.0f,z));
  R[k * 8] = x;`);
  let foam=take('riverFoam');
  foam=replaceOnce(foam,'int nz, float dz, float dt)', 'int nz, float x0, float z0, float dx, float dz, float dt)');
  foam=replaceOnce(foam,'float x = -48.0f + (float)(k % nx) * 96.0f / (float)(nx - 1),\n        z = (float)j * dz;', 'float x = x0 + (float)(k % nx)*dx, z = z0 + (float)j * dz;\n  if (channelDistance(World,x,z)>3.0f || z < -620.0f || z > 820.0f) return;');
  let reconstruction=take('reconstructRiver');
  reconstruction=replaceOnce(reconstruction,'int nx, int nz, float dz, float time,','int nx, int nz, float x0, float z0, float dx, float dz, float time,');
  reconstruction=replaceOnce(reconstruction,'float x = -48.0f + (float)i * 96.0f / (float)(nx - 1);', 'float x = x0 + (float)i*dx;\n  if (channelDistance(World,x,z0+(float)j*dz)>25.0f || z0+(float)j*dz < -640.0f || z0+(float)j*dz > 850.0f) return;');
  reconstruction=reconstruction.replaceAll('(float)j * dz','z0 + (float)j * dz').replaceAll('(float)nj * dz','z0 + (float)nj * dz');
  reconstruction=reconstruction.replaceAll('-48.0f + (float)ni * 96.0f / (float)(nx - 1)','x0 + (float)ni*dx').replaceAll('-48.0f + (float)i * 96.0f / (float)(nx - 1)','x0 + (float)i*dx');
  reconstruction=replaceOnce(reconstruction,'smooth(0.0f, 4.0f, z) * (1.0f - smooth(106.0f, 110.0f, z))','smooth(-640.0f, -580.0f, z) * (1.0f - smooth(700.0f, 850.0f, z))');
  reconstruction=replaceOnce(reconstruction,'Eta[k] = e + detail * seam','Eta[k] = e + detail * (1.0f-smooth(.45f,1.2f,fmaxf(dx,dz)*2.6f)) * seam');
  // The original short flume extrapolates a prescribed river datum into dry
  // cells. On an island this invents water on banks and behind isolated rocks.
  // Retain Saltreach's local wet/dry reconstruction for every dry cell instead.
  const dryStart=reconstruction.indexOf('  if (S[2 * n + k] < .06f) {');
  const dryEnd=reconstruction.indexOf('  float z =',dryStart);
  if(dryStart<0||dryEnd<0)throw Error('Missing upstream dry reconstruction');
  reconstruction=reconstruction.slice(0,dryStart)+'  if (S[2*n+k]<.0005f) return;\n'+reconstruction.slice(dryEnd);
  let spray=cudaFunction(impacts,'waterfallSpray');
  spray=replaceOnce(spray,'int nx, int nz, float x0, float dx, float dz,','int nx, int nz, float x0, float z0, float dx, float dz,');
  spray=replaceOnce(spray,'float nominal = tier == 0 ? 32.0f : tier == 1 ? 63.0f : 86.0f;', 'float nominal = ledgeStart(World,tier,0.0f);');
  spray=spray.replaceAll('sampleZ / dz','(sampleZ-z0) / dz').replaceAll('cap(z / dz','cap((z-z0) / dz');
  let wet=take('rockWetness');
  wet=replaceOnce(wet,'int nx, int nz, float x0, float dx,','int nx, int nz, float x0, float z0, float dx,');
  wet=wet.replaceAll('z < 0.0f','z < z0').replaceAll('z > (float)(nz - 1) * dz','z > z0 + (float)(nz - 1) * dz').replaceAll('(int)(z / dz)','(int)((z-z0) / dz)').replace(' && channelDistance(World, x, z) < 1.0f','');
  let clearance=take('plantClearance');
  clearance=replaceOnce(clearance,'return fminf(channelDistance(World, x, z),\n               (ground - riverDatum(World, x, z)) * 2.0f);', 'float channel = z > -640.0f && z < 850.0f ? channelDistance(World,x,z) : 100.0f;\n  return fminf(channel, fminf(ground*2.0f,-shoreDistance(World,x,z)*.4f));');
  let trees=take('treeInstances');
  trees=replaceOnce(trees,'float z = 2.0f + randomRiver(World, k * 4 + 1001) * 106.0f;','float z = -980.0f + randomRiver(World,k*4+1001)*1560.0f;');
  trees=replaceOnce(trees,'76.0f;', '760.0f;');
  // Keep the source solver's 9 m/s river bound. Its finite-volume passes are the
  // Saltreach solver; only the directional advancing-front foam gets generalized.
  let hydro=coast.replaceAll('-5.0f,5.0f','-9.0f,9.0f');
  hydro=replaceOnce(hydro,'float advancingEdge=front*smooth(.15f,.95f,-ux)*(obstacle?.08f:1.0f);', `float bedX=i>0&&i<nx-1?(bed[k+1]-bed[k-1])/(2.0f*dx):0.0f;
 float bedZ=j>0&&j<nz-1?(bed[k+nx]-bed[k-nx])/(2.0f*dz):0.0f;
 float towardShore=(ux*bedX+vz*bedZ)/fmaxf(.001f,sqrtf(bedX*bedX+bedZ*bedZ));
 float advancingEdge=front*smooth(.15f,.95f,towardShore)*(obstacle?.08f:1.0f);`);
  trees=replaceOnce(trees,'if (plantClearance(World, R, x, z) > 3.5f)',
    'if (plantClearance(World, R, x, z)>6.0f && islandNoise(World,x*.007f,z*.007f)>.48f && riverGround(World, x, z)<125.0f)');
  // The equations remain upstream's, but static terrain is sampled from its
  // GPU cache. This avoids nested shader inlining and redundant rock/tree work.
  const cacheArgs='const float *S, int nx, int nz, float x0, float z0, float dx, float dz';
  const cacheCall='S,nx,nz,x0,z0,dx,dz';
  const terrainCache=`__device__ float cachedField(const float *S,int nx,int nz,float x0,float z0,float dx,float dz,float x,float z,int layer){
    float gx=cap((x-x0)/dx,0.0f,(float)nx-1.001f),gz=cap((z-z0)/dz,0.0f,(float)nz-1.001f);
    int i=(int)gx,j=(int)gz;float fx=gx-(float)i,fz=gz-(float)j;
    return adv(S+layer*nx*nz,j*nx+i,nx,1.0f-fx,fx,1.0f-fz,fz);
  }`;
  let coastRock=cudaFunction(coastRender,'rockHeight').replace('float rockHeight(', 'float coastRock(').replace('int o=r*10;', 'int o=r*8;');
  coastRock=coastRock.replaceAll('R[o+5]','ROCK_SEED').replaceAll('R[o+6]','R[o+5]').replaceAll('ROCK_SEED','R[o+6]');
  coastRock=coastRock.replaceAll('R[o+8]','sinf(R[o+7])').replaceAll('R[o+7]*','cosf(R[o+7])*');
  let cachedRock=take('riverRock').replace('float riverRock(', 'float cachedRock(');
  cachedRock=replaceOnce(cachedRock,'float z) {',`float z, float ground) {
  if(k>=65)return fmaxf(ground,coastRock(R,k,x,z));`);
  cachedRock=cachedRock.replaceAll('riverGround(World, x, z)','ground');
  cachedRock=replaceOnce(cachedRock,'float ground = ground,\n        rock =','float rock =');
  rocks=replaceOnce(rocks,'int count) {',`${cacheArgs}, int count) {`);
  rocks=rocks.replaceAll('riverGround(World, x, z)',`cachedField(${cacheCall},x,z,1)`);
  let rockGeometry=take('rockVertices');
  rockGeometry=replaceOnce(rockGeometry,'int count, int start)',`${cacheArgs}, int count, int start)`);
  rockGeometry=rockGeometry.replaceAll('riverGround(World, x, z)',`cachedField(${cacheCall},x,z,1)`);
  rockGeometry=rockGeometry.replace(/riverRock\(World, R, r, ([^,]+), ([^)]+)\)/g,(_,x,z)=>`cachedRock(World,R,r,${x},${z},cachedField(${cacheCall},${x},${z},1))`);
  clearance=replaceOnce(clearance,'float z) {',`float z, ${cacheArgs}) {`);
  clearance=clearance.replaceAll('riverGround(World, x, z)',`cachedField(${cacheCall},x,z,1)`);
  clearance=clearance.replaceAll('riverBed(World, R, x, z)',`cachedField(${cacheCall},x,z,0)`);
  trees=replaceOnce(trees,'int count)',`${cacheArgs}, int count)`);
  trees=trees.replaceAll('plantClearance(World, R, x, z)',`plantClearance(World,R,x,z,${cacheCall})`);
  trees=trees.replaceAll('riverGround(World, x, z)',`cachedField(${cacheCall},x,z,1)`);
  trees=replaceOnce(trees,'valid = 1.0f;',`float sx=(cachedField(${cacheCall},x+dx,z,1)-cachedField(${cacheCall},x-dx,z,1))/(2.0f*dx);
      float sz=(cachedField(${cacheCall},x,z+dz,1)-cachedField(${cacheCall},x,z-dz,1))/(2.0f*dz);
      if(sx*sx+sz*sz>.55f || cachedField(${cacheCall},x,z,2)>.015f)continue;
      valid = 1.0f;`);
  trees=replaceOnce(trees,'valid * (3.5f + powf(randomRiver(World, k * 4 + 1004), .8f) * 16.0f);',
    `valid * (4.5f + powf(randomRiver(World, k * 4 + 1004), .8f) * 15.0f)
      * (.48f+.52f*smooth(25.0f,200.0f,-shoreDistance(World,x,z)))
      * (1.0f-.25f*smooth(65.0f,125.0f,Trees[k*4+1]));`);
  let foliage=cudaFunction(island,'forestVertices').replace('void forestVertices','void foliageVertices');
  let detail=cudaFunction(coastRender,'surfaceDetail');
  // Controls[1] now carries normalized runoff, not the demo's wave heading.
  detail=replaceOnce(detail,'angle=Controls[1]*.0174532925f','angle=0.0f');
  detail=replaceOnce(detail,'height+=DetailW[a+3]*(cosf(phase)+.18f*cosf(2.0f*phase));',
    'float resolved=fmaxf(dx,dz)<.31f?1.0f:1.0f-smooth(.65f,1.5f,sqrtf(kx*kx+kz*kz)*fmaxf(dx,dz));\n  height+=DetailW[a+3]*(cosf(phase)+.18f*cosf(2.0f*phase))*resolved;');
  detail=replaceOnce(detail,'+time*DetailW[a+2]','-time*DetailW[a+2]');
  detail=replaceOnce(detail,'Eta[k]+=height*fade*Controls[0];','Eta[k]+=height*fade*Controls[0]*(1.0f-smooth(1.0f,3.0f,S[k]+depth));');
  // Riffle foam is driven by local slope and wet current, not a fixed white stripe.
  foam=replaceOnce(foam,'* 1.7f;','* smooth(.035f,.18f,slope) * .45f;');
  let source = [...['noiseHash','noiseValue','generateNoise','randomSpray','sampleScalar','sprayVertices'].map(n=>cudaFunction(coastRender,n)),hydro,linked,valley,shore,oceanCuda,islandHelpers,terrainCache,rocks,cudaFunction(coastRender,'sminRock'),coastRock,...['rockType','rockExponent','rockEdge','riverRock','riverBed'].map(take),cachedRock,rockGeometry,clearance,trees,foliage,foam,wet,cudaFunction(coastRender,'reconstruct'),reconstruction,detail,spray,islandKernels].join('\n\n');
  // All scenery powers have nonnegative bases. Avoid the compiler's generic
  // powf integer-exponent path, which otherwise pulls software binary64 loops
  // into float-only scene generation and can explode driver compilation time.
  // This is normal single-precision exp2/log2 scene math, not a solver change.
  const positivePower='__device__ float scenePow(float base,float exponent){if(base<=0.0f)return exponent==0.0f?1.0f:0.0f;return exp2f(log2f(base)*exponent); }';
  source=positivePower+'\n'+source.replaceAll('powf(', 'scenePow(');
  let meadow=grass.replace('// PLANT_MODEL',plant);
  meadow=replaceOnce(meadow,'unsigned int reset, float season, float water)', 'unsigned int reset, float season, float water, const float *S, int nx, int nz, float x0, float z0, float dx, float dz)');
  meadow=replaceOnce(meadow,'        roots[i] = plant.root;', `        float px=plant.root.x, pz=plant.root.z;
        float gx=(px-x0)/dx, gz=(pz-z0)/dz;
        int ix=(int)cap(gx,0.0f,(float)nx-1.001f), iz=(int)cap(gz,0.0f,(float)nz-1.001f);
        int ncell=nx*nz, q=iz*nx+ix;
        float fx=cap(gx-(float)ix,0.0f,1.0f), fz=cap(gz-(float)iz,0.0f,1.0f);
        float ground=adv(S+ncell,q,nx,1.0f-fx,fx,1.0f-fz,fz);
        float bed=adv(S,q,nx,1.0f-fx,fx,1.0f-fz,fz);
        float depth=adv(S+2*ncell,q,nx,1.0f-fx,fx,1.0f-fz,fz);
        float slopeX=(S[ncell+q+1]-S[ncell+q])/dx, slopeZ=(S[ncell+q+nx]-S[ncell+q])/dz;
        if (gx<0.0f || gz<0.0f || gx>(float)nx-1.0f || gz>(float)nz-1.0f || ground<2.35f || ground>155.0f || bed-ground>.07f || depth>.025f || slopeX*slopeX+slopeZ*slopeZ>1.15f) plant.shape.x=0.0f;
        plant.root.y += ground;
        roots[i] = plant.root;`);
  meadow=replaceOnce(meadow,'float y=s.x*height*0.5f-eyeY;', 'float y=r.y+s.x*height*0.5f-eyeY;');
  meadow=replaceOnce(meadow,'sqrtf(x*x+z*z+eyeY*eyeY)', 'sqrtf(x*x+z*z+(r.y-eyeY)*(r.y-eyeY))');
  meadow=replaceOnce(meadow,'unsigned int inspect) {','unsigned int inspect, const float *S, int nx, int nz, float x0, float z0, float dx, float dz) {');
  meadow=replaceOnce(meadow,'if (distance>46.0f || depth < -3.5f) return;',`if (distance>46.0f || depth < -3.5f) return;
        int gi=(int)cap((r.x-x0)/dx,0.0f,(float)nx-1.0f),gj=(int)cap((r.z-z0)/dz,0.0f,(float)nz-1.0f),gk=gj*nx+gi,gn=nx*nz;
        if(S[2*gn+gk]>.025f && r.y<S[gk]+S[2*gn+gk]-.02f)return;`);
  const grassSource=[cudaFunction(hydro,'cap'),cudaFunction(hydro,'adv'),meadow].join('\n');
  return {source,grassSource};
}
