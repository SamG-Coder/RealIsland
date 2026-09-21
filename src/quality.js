export const QUALITY = Object.freeze({
  low: {name:'Low · mobile', grid:513, trees:600, grass:65536, scale:.65, maxDpr:1, cloudSteps:12, envWidth:384, envHeight:96, light:96, reflection:false, distant:64, maxSteps:4, patchNx:257, patchNz:257, spraySlots:64, weatherInterval:.3},
  balanced: {name:'Balanced', grid:769, trees:2200, grass:524288, scale:.85, maxDpr:1.5, cloudSteps:48, envWidth:1024, envHeight:256, light:512, reflection:true, distant:256, maxSteps:4},
  high: {name:'High', grid:1025, trees:3000, grass:1048576, scale:1, maxDpr:1.5, cloudSteps:64, envWidth:1536, envHeight:384, light:768, reflection:true, distant:256, maxSteps:4},
  ultra: {name:'Ultra · desktop', grid:1281, trees:4000, grass:2097152, scale:1, maxDpr:2, cloudSteps:80, envWidth:2048, envHeight:512, light:1024, reflection:true, distant:384, maxSteps:4},
  test: {name:'Validation only', grid:513, trees:64, grass:65536, scale:.6, maxDpr:1, cloudSteps:12, envWidth:128, envHeight:32, light:64, reflection:true, distant:64, maxSteps:2}
});
export function qualityFor(name) {return QUALITY[name] || QUALITY.balanced;}
export function gridFor(q) {return {nx:q.grid,nz:q.grid,x0:-1600,z0:-1600,dx:3200/(q.grid-1),dz:3200/(q.grid-1)};}
