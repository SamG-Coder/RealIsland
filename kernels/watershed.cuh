// A finite catchment, in metres. Source z=-600, tidal outlet z=760.
// Concave longitudinal grade; small bedrock riffles occur only upstream.
// These replace endless-reach layout helpers, not the upstream water solver.
__device__ float riverCenter(const float *World, float z) {
  float t=cap((z+600.0f)/1360.0f,0.0f,1.0f);
  float phase=randomRiver(World,73)*1.3f;
  return -280.0f+510.0f*t+65.0f*sinf(t*6.0f)+25.0f*sinf(t*12.0f+phase)*smooth(.15f,.8f,t);
}
__device__ float riverWidth(const float *World, float z) {
  float t=cap((z+600.0f)/1360.0f,0.0f,1.0f);
  // Bankfull half-width; ordinary water occupies only the inset bed.
  // The broad downstream section is a tidal inlet, not freshwater discharge.
  float margin=.45f*sinf(z*.071f)+.25f*sinf(z*.137f+1.7f);
  return 5.0f+2.0f*t+margin+21.0f*smooth(.80f,1.0f,t);
}
__device__ float forkAmount(const float *World, float z) { return 0.0f; }
__device__ float ledgeStart(const float *World,int tier,float x) {
  return -440.0f+(float)tier*225.0f+randomRiver(World,901+tier)*24.0f+1.2f*sinf(x*.06f);
}
__device__ float ledgeWidth(const float *World,int tier,float x) { return 18.0f+(float)tier*8.0f; }
__device__ float ledgeHeight(const float *World,int tier) { return .18f-(float)tier*.05f; }
__device__ float riverDatum(const float *World,float x,float z) {
  float t=cap((z+600.0f)/1360.0f,0.0f,1.0f);
  float y=18.0f*(1.0f-t)*(1.0f-t);
  for(int tier=0;tier<3;tier++) {
    float start=ledgeStart(World,tier,0.0f);
    y+=ledgeHeight(World,tier)*(1.0f-smooth(start,start+ledgeWidth(World,tier,0.0f),z));
  }
  return y;
}
