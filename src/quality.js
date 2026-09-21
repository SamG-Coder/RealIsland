export const QUALITY = Object.freeze({
  low: {name:'Low · mobile', grid:257, grass:262144, scale:.70, maxDpr:1, cloudSteps:24, envWidth:384, envHeight:96, light:192, reflection:false, distant:128, maxSteps:4},
  balanced: {name:'Balanced', grid:513, grass:524288, scale:.85, maxDpr:1.5, cloudSteps:48, envWidth:512, envHeight:128, light:256, reflection:true, distant:256, maxSteps:4},
  high: {name:'High', grid:769, grass:1048576, scale:1, maxDpr:1.5, cloudSteps:64, envWidth:768, envHeight:192, light:384, reflection:true, distant:256, maxSteps:4},
  ultra: {name:'Ultra · desktop', grid:1025, grass:2097152, scale:1, maxDpr:2, cloudSteps:80, envWidth:1024, envHeight:256, light:512, reflection:true, distant:384, maxSteps:4},
  test: {name:'Validation only', grid:129, grass:65536, scale:.6, maxDpr:1, cloudSteps:12, envWidth:128, envHeight:32, light:64, reflection:true, distant:64, maxSteps:2}
});
export function qualityFor(name) {return QUALITY[name] || QUALITY.balanced;}
export function gridFor(q) {return {nx:q.grid,nz:q.grid,x0:-400,z0:-400,dx:800/(q.grid-1),dz:800/(q.grid-1)};}
