// A conservative topographic estimate, evaluated once from the generated DEM.
// Strict D8 descent excludes trapped depressions rather than inventing outlets.
// Annual effective runoff is rainfall minus losses, NOT annual rainfall itself.
export const EFFECTIVE_RUNOFF_MM=1000;
export const SECONDS_PER_YEAR=365.25*86400;
export function runoffDischarge(areaM2,runoffMm=EFFECTIVE_RUNOFF_MM){return areaM2*runoffMm/1000/SECONDS_PER_YEAR;}
export function headwaterBudget(state,g,runoffMm=EFFECTIVE_RUNOFF_MM){
  const {nx,nz,x0,z0,dx,dz}=g,n=nx*nz,area=dx*dz;
  const contributes=new Uint8Array(n),order=[];
  let landCells=0,lakeVolume=0;
  for(let k=0;k<n;k++){
    const x=x0+k%nx*dx,z=z0+Math.floor(k/nx)*dz;
    if(state[n+k]>0){order.push(k);landCells++;}
    if(((x+280)/72)**2+((z+690)/90)**2<1){contributes[k]=1;lakeVolume+=Math.max(0,18.39-state[k])*area;}
  }
  // Low cells first: each cell inherits its steepest receiver's lake membership.
  order.sort((a,b)=>state[n+a]-state[n+b]);
  let catchmentCells=0;
  for(const k of order){
    if(!contributes[k]){
      const i=k%nx,j=Math.floor(k/nx);let receiver=-1,steepest=0;
      for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){
        if((!a&&!b)||i+a<0||i+a>=nx||j+b<0||j+b>=nz)continue;
        const q=k+b*nx+a,slope=(state[n+k]-state[n+q])/Math.hypot(a*dx,b*dz);
        if(slope>steepest){steepest=slope;receiver=q;}
      }
      if(receiver>=0)contributes[k]=contributes[receiver];
    }
    catchmentCells+=contributes[k];
  }
  const catchmentAreaM2=catchmentCells*area,dischargeM3s=runoffDischarge(catchmentAreaM2,runoffMm);
  return {method:'Strict D8 descent to headwater lake; closed depressions excluded',effectiveRunoffMmPerYear:runoffMm,
    landAreaKm2:landCells*area/1e6,catchmentAreaKm2:catchmentAreaM2/1e6,dischargeM3s,
    sourceAreaM2:area,sourceDepthRate:dischargeM3s/area,
    initialLakeVolumeM3:lakeVolume,assumption:'Illustrative wet temperate net runoff, not measured climate or a calibrated rainfall/groundwater model'};
}
