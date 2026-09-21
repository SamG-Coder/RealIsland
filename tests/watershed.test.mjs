import test from 'node:test';
import assert from 'node:assert/strict';
import {auditWatershed} from '../src/watershed-audit.js';
import {oceanSample,oceanBands,oceanCuda,oceanWgsl} from '../src/ocean.js';

test('wet connectivity detects a blocked river even when both ends contain water',()=>{
  const nx=33,n=nx*nx,g={nx,nz:nx,x0:-1600,z0:-1600,dx:100,dz:100};
  const state=new Float32Array(n*19);
  for(let j=0;j<nx;j++)for(let i=0;i<nx;i++){
    const k=j*nx+i,land=i>=7&&i<=25&&j>=7&&j<=25;
    state[k]=state[n+k]=land?200:-24;state[2*n+k]=land?0:24;
  }
  for(let j=10;j<=25;j++){const k=j*nx+16;state[k]=state[n+k]=50-(j-10)*3.4;state[2*n+k]=.7;}
  assert.equal(auditWatershed(state,g).reachesOcean,true);
  state[2*n+20*nx+16]=0;
  assert.equal(auditWatershed(state,g).reachesOcean,false);
});
test('swell normal matches the height derivative and uses one spectrum for CUDA and WGSL',()=>{
  const x=137,z=-59,t=4,e=.001,a=oceanSample(x,z,t);
  assert.ok(Math.abs(a.dx-(oceanSample(x+e,z,t).height-oceanSample(x-e,z,t).height)/(2*e))<1e-8);
  assert.ok(Math.abs(a.dz-(oceanSample(x,z+e,t).height-oceanSample(x,z-e,t).height)/(2*e))<1e-8);
  assert.deepEqual(oceanSample(x,z,t,0),{height:0,dx:0,dz:0});
  for(const b of oceanBands){assert.ok(b.kx>0&&b.omega>0);assert.ok(oceanCuda.includes(b.omega.toFixed(9)));assert.ok(oceanWgsl.includes(b.omega.toFixed(9)));}
});

// Verify provenance against the real pinned source, not a duplicated parameter list.
import {WAVES,incoming} from '../vendor/coast/src/coast.js';
test('the island swell is the original coastal spectrum reflected toward the west beach',()=>{
  assert.equal(oceanBands.length,WAVES.length);
  for(const [x,z,t] of [[10,40,0],[-940,160,23],[17,-31,123]])assert.ok(Math.abs(oceanSample(x,z,t).height-incoming(-x,z,t,{wind:0,tide:0,strength:1}))<1e-12);
  for(let i=0;i<WAVES.length;i++){
    assert.equal(oceanBands[i].amplitude,WAVES[i].a);
    assert.equal(oceanBands[i].omega,WAVES[i].w);
    assert.equal(oceanBands[i].kx,WAVES[i].k);
    assert.equal(oceanBands[i].kz,-WAVES[i].z);
  }
});
