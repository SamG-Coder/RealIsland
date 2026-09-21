/** Standard GPU f32 division for visual-only code. The finite-volume water
 * solver keeps the upstream compensated division. Source bounds never rely on
 * subnormal/NaN division in scenery. This avoids hundreds of inlined branches
 * in the original weather shader on software/mobile drivers.
 */
export function visualMath(wgsl) {
  const start=wgsl.indexOf('fn cw_divide_f32(');
  if(start<0)return wgsl;
  const open=wgsl.indexOf('{',start);let end=open+1,depth=1;
  for(;depth&&end<wgsl.length;end++){if(wgsl[end]==='{')depth++;if(wgsl[end]==='}')depth--;}
  if(depth)throw Error('Invalid upstream f32 division helper.');
  return wgsl.slice(0,start)+'fn cw_divide_f32(a:f32,b:f32)->f32 {return a/b;}'+wgsl.slice(end);
}
