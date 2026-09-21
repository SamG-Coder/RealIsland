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
export function assembleSources({coast, coastRender, river, impacts, grass, plant, island}) {
  const take = name => cudaFunction(river,name);
  const helpers = ['worldHash','randomRiver','boundaryRandom','riverCenter','riverWidth','forkAmount','forkSide','branchCenter','channelDistance','ledgeStart','ledgeWidth','ledgeHeight','riverDatum','riverLevel','terrainNoise'].map(take).join('\n');
  let linked = helpers.replaceAll('World[1] + z / 110.0f','World[1] + (z + 150.0f) / 330.0f');
  linked = replaceOnce(linked,'return base + randomRiver(World, 901 + tier) * 9.0f +\n         2.0f * sinf(x * .19f + randomRiver(World, 941 + tier) * 6.28f);',
    'return -150.0f + 3.0f * (base + randomRiver(World, 901 + tier) * 9.0f +\n         2.0f * sinf(x * .19f + randomRiver(World, 941 + tier) * 6.28f));');
  linked = replaceOnce(linked,'return 3.0f + randomRiver(World, 951 + tier) * 4.0f +\n         .65f * sinf(x * .25f + (float)tier);',
    'return 3.0f * (3.0f + randomRiver(World, 951 + tier) * 4.0f +\n         .65f * sinf(x * .25f + (float)tier));');
  linked = replaceOnce(linked,'return 7.0f * (tier == 0 ? a : tier == 1 ? b : c) / (a + b + c);','return 21.0f * (tier == 0 ? a : tier == 1 ? b : c) / (a + b + c);');
  linked = replaceOnce(linked,'float y = -z / 110.0f;','z = cap(z, -150.0f, 180.0f);\n  float y = 24.0f - (z + 150.0f) / 110.0f;');
  const valley = take('riverGround').replace('float riverGround(', 'float valleyGround(');
  let shore = cudaFunction(coastRender,'terrain').replace('float terrain(', 'float shoreProfile(');
  shore = replaceOnce(shore,'float d=x-(-1.7f+2.3f*sinf(z*.027f)+.00042f*z*z);','float d=x;');
  const [islandHelpers, islandKernels] = island.split('// ISLAND_KERNELS');
  if (!islandKernels) throw Error('Island CUDA marker missing');
  let rocks = take('initializeRocks');
  rocks = replaceOnce(rocks,'float z = 8.0f + randomRiver(World, k * 9 + 2) * 94.0f;', 'float z = -150.0f + 3.0f * (8.0f + randomRiver(World, k * 9 + 2) * 94.0f);');
  rocks = replaceOnce(rocks,'  R[k * 8] = x;', `  // Keep the first 65 original river rocks; distribute the others on the coast.
  if (k >= 65) {
    float a = randomRiver(World, k * 41 + 371) * 6.2831853f;
    float radius = islandRadius(World, a) + (randomRiver(World,k+407)-.48f)*14.0f;
    x = cosf(a) * radius * .88f; z = sinf(a) * radius - 65.0f;
    s = 1.7f + randomRiver(World,k+503)*4.4f;
  }
  R[k * 8] = x;`);
  let foam=take('riverFoam');
  foam=replaceOnce(foam,'int nz, float dz, float dt)', 'int nz, float x0, float z0, float dx, float dz, float dt)');
  foam=replaceOnce(foam,'float x = -48.0f + (float)(k % nx) * 96.0f / (float)(nx - 1),\n        z = (float)j * dz;', 'float x = x0 + (float)(k % nx)*dx, z = z0 + (float)j * dz;\n  if (channelDistance(World,x,z)>3.0f || z < -154.0f || z > 185.0f) return;');
  let reconstruction=take('reconstructRiver');
  reconstruction=replaceOnce(reconstruction,'int nx, int nz, float dz, float time,','int nx, int nz, float x0, float z0, float dx, float dz, float time,');
  reconstruction=replaceOnce(reconstruction,'float x = -48.0f + (float)i * 96.0f / (float)(nx - 1);', 'float x = x0 + (float)i*dx;\n  if (channelDistance(World,x,z0+(float)j*dz)>25.0f || z0+(float)j*dz < -157.0f || z0+(float)j*dz > 183.0f) return;');
  reconstruction=reconstruction.replaceAll('(float)j * dz','z0 + (float)j * dz').replaceAll('(float)nj * dz','z0 + (float)nj * dz');
  reconstruction=reconstruction.replaceAll('-48.0f + (float)ni * 96.0f / (float)(nx - 1)','x0 + (float)ni*dx').replaceAll('-48.0f + (float)i * 96.0f / (float)(nx - 1)','x0 + (float)i*dx');
  reconstruction=replaceOnce(reconstruction,'smooth(0.0f, 4.0f, z) * (1.0f - smooth(106.0f, 110.0f, z))','smooth(-157.0f, -145.0f, z) * (1.0f - smooth(164.0f, 183.0f, z))');
  let spray=cudaFunction(impacts,'waterfallSpray');
  spray=replaceOnce(spray,'int nx, int nz, float x0, float dx, float dz,','int nx, int nz, float x0, float z0, float dx, float dz,');
  spray=replaceOnce(spray,'float nominal = tier == 0 ? 32.0f : tier == 1 ? 63.0f : 86.0f;', 'float nominal = -150.0f + 3.0f * (tier == 0 ? 32.0f : tier == 1 ? 63.0f : 86.0f);');
  spray=spray.replaceAll('sampleZ / dz','(sampleZ-z0) / dz').replaceAll('cap(z / dz','cap((z-z0) / dz');
  let wet=take('rockWetness');
  wet=replaceOnce(wet,'int nx, int nz, float x0, float dx,','int nx, int nz, float x0, float z0, float dx,');
  wet=wet.replaceAll('z < 0.0f','z < z0').replaceAll('z > (float)(nz - 1) * dz','z > z0 + (float)(nz - 1) * dz').replaceAll('(int)(z / dz)','(int)((z-z0) / dz)').replace(' && channelDistance(World, x, z) < 1.0f','');
  let clearance=take('plantClearance');
  clearance=replaceOnce(clearance,'return fminf(channelDistance(World, x, z),\n               (ground - riverDatum(World, x, z)) * 2.0f);', 'float channel = z > -157.0f && z < 185.0f ? channelDistance(World,x,z) : 100.0f;\n  return fminf(channel, fminf(ground*2.0f,-shoreDistance(World,x,z)*.4f));');
  let trees=take('treeInstances');
  trees=replaceOnce(trees,'float z = 2.0f + randomRiver(World, k * 4 + 1001) * 106.0f;','float z = -245.0f + randomRiver(World,k*4+1001)*390.0f;');
  trees=replaceOnce(trees,'76.0f;', '162.0f;');
  // Keep the source solver's 9 m/s river bound. Its finite-volume passes are the
  // Saltreach solver; only the directional advancing-front foam gets generalized.
  let hydro=coast.replaceAll('-5.0f,5.0f','-9.0f,9.0f');
  hydro=replaceOnce(hydro,'float advancingEdge=front*smooth(.15f,.95f,-ux)*(obstacle?.08f:1.0f);', `float bedX=i>0&&i<nx-1?(bed[k+1]-bed[k-1])/(2.0f*dx):0.0f;
 float bedZ=j>0&&j<nz-1?(bed[k+nx]-bed[k-nx])/(2.0f*dz):0.0f;
 float towardShore=(ux*bedX+vz*bedZ)/fmaxf(.001f,sqrtf(bedX*bedX+bedZ*bedZ));
 float advancingEdge=front*smooth(.15f,.95f,towardShore)*(obstacle?.08f:1.0f);`);
  // The equations remain upstream's, but static terrain is sampled from its
  // GPU cache. This avoids nested shader inlining and redundant rock/tree work.
  const cacheArgs='const float *S, int nx, int nz, float x0, float z0, float dx, float dz';
  const cacheCall='S,nx,nz,x0,z0,dx,dz';
  const terrainCache=`__device__ float cachedField(const float *S,int nx,int nz,float x0,float z0,float dx,float dz,float x,float z,int layer){
    float gx=cap((x-x0)/dx,0.0f,(float)nx-1.001f),gz=cap((z-z0)/dz,0.0f,(float)nz-1.001f);
    int i=(int)gx,j=(int)gz;float fx=gx-(float)i,fz=gz-(float)j;
    return adv(S+layer*nx*nz,j*nx+i,nx,1.0f-fx,fx,1.0f-fz,fz);
  }`;
  let cachedRock=take('riverRock').replace('float riverRock(', 'float cachedRock(');
  cachedRock=replaceOnce(cachedRock,'float z) {','float z, float ground) {');
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
  const source = [hydro,linked,valley,shore,islandHelpers,terrainCache,rocks,...['rockType','rockExponent','rockEdge','riverRock','riverBed'].map(take),cachedRock,rockGeometry,clearance,trees,take('foliageVertices'),foam,wet,cudaFunction(coastRender,'reconstruct'),reconstruction,cudaFunction(coastRender,'surfaceDetail'),spray,islandKernels].join('\n\n');
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
        if (gx<0.0f || gz<0.0f || gx>(float)nx-1.0f || gz>(float)nz-1.0f || ground<2.35f || bed-ground>.07f || depth>.025f || slopeX*slopeX+slopeZ*slopeZ>1.15f) plant.shape.x=0.0f;
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
