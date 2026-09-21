import test from 'node:test';
import assert from 'node:assert/strict';
import {headwaterBudget,runoffDischarge,SECONDS_PER_YEAR} from '../src/hydrology.js';
test('runoff uses effective rainfall depth, contributing area and seconds',()=>{
  assert.ok(Math.abs(runoffDischarge(1e6,1000)*SECONDS_PER_YEAR-1e6)<1e-8);
  assert.equal(runoffDischarge(1e6,0),0);
  assert.ok(Math.abs(runoffDischarge(2.868e6,1000)-.09088)<.0001);
});
test('headwater budget excludes land draining away from the lake',()=>{
  const g={nx:41,nz:41,x0:-480,z0:-890,dx:10,dz:10},n=g.nx*g.nz,s=new Float32Array(n*3);
  for(let k=0;k<n;k++){
    const x=g.x0+k%g.nx*10,z=g.z0+Math.floor(k/g.nx)*10;
    // Western basin descends to the lake; east of a divide, drains away.
    s[k]=s[n+k]=x<-170?15+Math.hypot(x+280,z+690)*.1:40-(x+170)*.1;
  }
  const b=headwaterBudget(s,g);
  assert.ok(b.catchmentAreaKm2>0.05);
  assert.ok(b.catchmentAreaKm2<b.landAreaKm2*.85);
  assert.equal(b.sourceDepthRate*b.sourceAreaM2,b.dischargeM3s);
  assert.ok(b.initialLakeVolumeM3>0);
});
