// Fine coastal water shares the parent GPU device, terrain, rocks and clock.
// The upstream Saltreach finite-volume passes run at their original 0.3 m scale.
export class CoastalPatch {
  static async create(parent,progress){
    const g=parent.grid,j=Math.round((160-g.z0)/g.dz);
    const row=await parent.runtime.read(parent.S,Float32Array,g.nx*4,(parent.n+j*g.nx)*4);
    const i=row.findIndex(h=>h>.1),shoreX=g.x0+i*g.dx;
    if(i<0)throw Error('Could not locate the exposed coast');
    const patch=new CoastalPatch(parent,shoreX);
    const batch=parent.runtime.batch();patch.dispatch(batch,'scrollWater',{reset:1,shiftX:0,shiftZ:0});patch.dispatch(batch,'commitScroll');patch.dispatch(batch,'islandTerrain');batch.submit();await parent.runtime.idle();
    progress('Resolving the coastal waves at 0.3 metres',.60);
    return patch;
  }
  constructor(parent,shoreX){
    this.parent=parent;this.shoreX=shoreX;this.runtime=parent.runtime;this.kernels=parent.kernels;this.bindings=new Map();
    this.grid={nx:513,nz:401,x0:shoreX-105,z0:100,dx:.3,dz:.3};this.n=this.grid.nx*this.grid.nz;
    for(const key of ['World','R','Controls','DetailW'])this[key]=parent[key];
    this.Coarse=parent.S;this.CoarseEta=parent.Eta;
    for(const [name,size] of [['S',this.n*19*4],['Aux',this.n*4*4],['Eta',this.n*4],['Terrain',this.n*8*4],['Scroll',this.n*19*4],['ScrollAux',this.n*4*4],['Particles',105*256*12*4],['Spray',105*256*8*4],['RockState',105*8*4]])this[name]=this.runtime.createBuffer(size,{label:`0.3 m coastal ${name}`});
  }
  values(extra={}){const g=this.parent.grid;return {...this.parent.values(),...this.grid,count:this.n,rockCount:105,slots:256,step:this.parent.steps,cnx:g.nx,cnz:g.nz,cx0:g.x0,cz0:g.z0,cdx:g.dx,cdz:g.dz,...extra};}
  dispatch(batch,name,extra={},count=this.n){return this.parent.dispatch.call(this,batch,name,extra,count);}
  follow(batch,camera,basis){
    const g=this.grid,p=this.parent.grid;
    const width=(g.nx-1)*g.dx,height=(g.nz-1)*g.dz;
    const look=Math.hypot(basis.forward[0],basis.forward[2]);
    const lead=look>0.1?12/look:0;
    const cx=camera.x+basis.forward[0]*lead,cz=camera.z+basis.forward[2]*lead;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const wantX=clamp(cx-width/2,p.x0,p.x0+(p.nx-1)*p.dx-width);
    const wantZ=clamp(cz-height/2,p.z0,p.z0+(p.nz-1)*p.dz-height);
    const shiftX=Math.abs(wantX-g.x0)>9.6?Math.round((wantX-g.x0)/g.dx/16)*16:0;
    const shiftZ=Math.abs(wantZ-g.z0)>9.6?Math.round((wantZ-g.z0)/g.dz/16)*16:0;
    if(!shiftX&&!shiftZ)return false;
    // Write back the old footprint before moving so revisits inherit live water.
    this.dispatch(batch,'exchangeCoastalPatch',{},this.parent.n);
    g.x0+=shiftX*g.dx;g.z0+=shiftZ*g.dz;
    this.dispatch(batch,'scrollWater',{shiftX,shiftZ,reset:0});this.dispatch(batch,'commitScroll');
    this.dispatch(batch,'islandTerrain');
    this.moves=(this.moves||0)+1;this.lastShift={shiftX,shiftZ};
    this.dispatch(batch,'reconstruct');this.dispatch(batch,'surfaceDetail');
    return true;
  }
  step(batch){
    for(const name of ['advectMomentum','faces','limits','limitFlux','integrate','coastalPatchBoundary'])this.dispatch(batch,name);
    if(this.parent.steps%4===0){this.dispatch(batch,'transport',{dt:1/30});this.dispatch(batch,'commitTransport');}
  }
  publish(batch){
    this.dispatch(batch,'reconstruct');this.dispatch(batch,'surfaceDetail');
    this.dispatch(batch,'coastalImpact',{},105);this.dispatch(batch,'sprayVertices',{count:105*256},105*256);
    this.dispatch(batch,'exchangeCoastalPatch',{},this.parent.n);
  }
  async diagnostics(){
    const [s,eta,contacts]=await Promise.all([this.runtime.read(this.S),this.runtime.read(this.Eta),this.runtime.read(this.RockState)]);
    const n=this.n,g=this.grid;let min=Infinity,max=-Infinity,foam=0,nonfinite=0,wet=0;
    const transect=[];
    for(const v of s)if(!Number.isFinite(v))nonfinite++;
    for(let k=0;k<n;k++)if(s[2*n+k]>.04){min=Math.min(min,eta[k]);max=Math.max(max,eta[k]);foam+=s[5*n+k];wet++;}
    const j=Math.floor(g.nz/2);
    for(let i=0;i<g.nx;i+=4){const k=j*g.nx+i;transect.push({x:g.x0+i*g.dx,bed:s[k],depth:s[2*n+k],height:eta[k],foam:s[5*n+k]});}
    const sprayEmitted=contacts.reduce((sum,v,i)=>sum+(i%8===5?v:0),0);
    return {grid:g,sprayEmitted,upstream:'vendor/coast/src/coastal-kernels.cu + coastal-render.cu',clock:this.parent.time,moves:this.moves||0,lastShift:this.lastShift,nonfinite,wet,minHeight:min,maxHeight:max,foam,transect};
  }
}
