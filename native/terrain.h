#pragma once
#include <cstdint>

constexpr int kWidth = 960;
constexpr int kHeight = 540;

struct Camera {
  float x, y, z;
  float yaw, pitch;
};

bool initializeTerrain(int seed, char* error, int errorSize);
bool renderTerrain(Camera camera, std::uint32_t* pixels, char* error, int errorSize);
void shutdownTerrain();
