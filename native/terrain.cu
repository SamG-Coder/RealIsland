#include "terrain.h"
#include <cuda_runtime.h>
#include <cmath>
#include <cstdio>

// The browser compiler accepts later helper declarations; nvcc requires these
// three declarations before compiling the same linked .cu source.
__device__ float cap(float, float, float);
__device__ float smooth(float, float, float);
__device__ float adv(const float*, int, int, float, float, float, float);
#include "../generated/island-linked.cu"

namespace {
constexpr int grid = 512;
constexpr float gridOrigin = -1600.0f;
constexpr float gridStep = 3200.0f / (grid - 1);
float* state = nullptr;
float* world = nullptr;
std::uint32_t* output = nullptr;

bool check(cudaError_t result, char* error, int size) {
  if (result == cudaSuccess) return true;
  std::snprintf(error, size, "CUDA: %s", cudaGetErrorString(result));
  return false;
}

__device__ float heightAt(const float* s, float x, float z) {
  float gx = fminf(grid - 1.001f, fmaxf(0.0f, (x - gridOrigin) / gridStep));
  float gz = fminf(grid - 1.001f, fmaxf(0.0f, (z - gridOrigin) / gridStep));
  int ix = (int)gx, iz = (int)gz, n = grid * grid;
  float fx = gx - ix, fz = gz - iz;
  float a = s[n + iz * grid + ix] * (1 - fx) + s[n + iz * grid + ix + 1] * fx;
  float b = s[n + (iz + 1) * grid + ix] * (1 - fx) + s[n + (iz + 1) * grid + ix + 1] * fx;
  return a * (1 - fz) + b * fz;
}

__device__ unsigned int rgba(float r, float g, float b) {
  unsigned int ri = (unsigned int)(fminf(255, fmaxf(0, r * 255)));
  unsigned int gi = (unsigned int)(fminf(255, fmaxf(0, g * 255)));
  unsigned int bi = (unsigned int)(fminf(255, fmaxf(0, b * 255)));
  return ri | (gi << 8) | (bi << 16) | 0xff000000u;
}

__global__ void view(const float* s, Camera camera, unsigned int* pixels) {
  int x = blockIdx.x * blockDim.x + threadIdx.x;
  int y = blockIdx.y * blockDim.y + threadIdx.y;
  if (x >= kWidth || y >= kHeight) return;
  float u = ((x + .5f) / kWidth * 2 - 1) * (float(kWidth) / kHeight) * .69f;
  float v = (1 - (y + .5f) / kHeight * 2) * .69f;
  float cy = cosf(camera.yaw), sy = sinf(camera.yaw);
  float cp = cosf(camera.pitch), sp = sinf(camera.pitch);
  float dx = sy * cp + cy * u + sy * sp * v;
  float dy = sp + cp * v;
  float dz = cy * cp - sy * u + cy * sp * v;
  float inv = rsqrtf(dx * dx + dy * dy + dz * dz);
  dx *= inv; dy *= inv; dz *= inv;
  float horizon = fmaxf(0, dy);
  float sky = .35f + .45f * horizon;
  unsigned int color = rgba(.36f * sky, .64f * sky, .93f * sky);
  float previous = camera.y - fmaxf(0.0f, heightAt(s, camera.x, camera.z));
  for (float t = 4.0f; t < 4500.0f; t += fmaxf(2.0f, t * .018f)) {
    float wx = camera.x + dx * t, wz = camera.z + dz * t;
    if (fabsf(wx) >= 1585.0f || fabsf(wz) >= 1585.0f) break;
    float ground = heightAt(s, wx, wz);
    float surface = fmaxf(ground, 0.0f);
    float delta = camera.y + dy * t - surface;
    if (delta <= 0 && previous > 0) {
      float hL = heightAt(s, wx - 6, wz), hR = heightAt(s, wx + 6, wz);
      float hB = heightAt(s, wx, wz - 6), hF = heightAt(s, wx, wz + 6);
      float slope = sqrtf((hR-hL)*(hR-hL)+(hF-hB)*(hF-hB)) / 12.0f;
      float light = fmaxf(.28f, fminf(1.1f, .72f + (hL-hR)*.017f + (hB-hF)*.013f));
      float fade = fminf(1.0f, t / 3100.0f);
      float r,g,b;
      if (ground < 0) { r=.08f; g=.35f; b=.53f; light=.75f + .08f*sinf(t*.02f); }
      else if (ground < 8) { r=.74f; g=.67f; b=.45f; }
      else if (ground > 145 || slope > 1.4f) { r=.47f; g=.47f; b=.43f; }
      else { r=.15f; g=.34f + .08f*sinf(wx*.045f)*sinf(wz*.045f); b=.15f; }
      color = rgba(r*light*(1-fade)+.35f*fade, g*light*(1-fade)+.52f*fade, b*light*(1-fade)+.67f*fade);
      break;
    }
    previous = delta;
  }
  pixels[y*kWidth+x] = color;
}
}

bool initializeTerrain(int seed, char* error, int errorSize) {
  if (!check(cudaSetDevice(0), error, errorSize)) return false;
  constexpr size_t count = size_t(grid) * grid;
  if (!check(cudaMalloc(&world, 2*sizeof(float)), error, errorSize)) return false;
  if (!check(cudaMalloc(&state, count * 19 * sizeof(float)), error, errorSize)) return false;
  if (!check(cudaMalloc(&output, kWidth * kHeight * sizeof(unsigned int)), error, errorSize)) return false;
  float values[]{float(seed),0.0f};
  if (!check(cudaMemcpy(world, values, sizeof(values), cudaMemcpyHostToDevice), error, errorSize)) return false;
  if (!check(cudaMemset(state, 0, count * 19 * sizeof(float)), error, errorSize)) return false;
  initializeIsland<<<(int(count)+127)/128,128>>>(world, nullptr, state, grid, grid, gridOrigin, gridOrigin, gridStep, gridStep, 0);
  return check(cudaDeviceSynchronize(), error, errorSize);
}

bool renderTerrain(Camera camera, std::uint32_t* pixels, char* error, int errorSize) {
  view<<<dim3((kWidth+15)/16,(kHeight+15)/16),dim3(16,16)>>>(state,camera,output);
  if (!check(cudaGetLastError(), error, errorSize)) return false;
  return check(cudaMemcpy(pixels, output, kWidth*kHeight*sizeof(std::uint32_t), cudaMemcpyDeviceToHost), error, errorSize);
}

void shutdownTerrain() {
  cudaFree(output); cudaFree(state); cudaFree(world);
  output = nullptr; state = nullptr; world = nullptr;
}
