cmake_minimum_required(VERSION 3.26)
project(RealIslandNative LANGUAGES CXX CUDA)

find_package(Vulkan REQUIRED)
find_program(NODE_EXECUTABLE node REQUIRED)
get_filename_component(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/.." ABSOLUTE)

add_custom_command(
  OUTPUT ${REPO_ROOT}/generated/island-linked.cu
  COMMAND ${NODE_EXECUTABLE} ${REPO_ROOT}/scripts/build-kernels.mjs
  WORKING_DIRECTORY ${REPO_ROOT}
  DEPENDS ${REPO_ROOT}/scripts/build-kernels.mjs
          ${REPO_ROOT}/kernels/island.cu
          ${REPO_ROOT}/src/source-assembly.js
  COMMENT "Linking the pinned island CUDA sources"
  VERBATIM)
add_custom_target(link_island_cuda DEPENDS ${REPO_ROOT}/generated/island-linked.cu)

add_executable(RealIslandNative WIN32 main.cpp terrain.cu)
add_dependencies(RealIslandNative link_island_cuda)
set_target_properties(RealIslandNative PROPERTIES
  CXX_STANDARD 17
  CUDA_STANDARD 17
  CUDA_SEPARABLE_COMPILATION OFF
  CUDA_ARCHITECTURES native)
target_include_directories(RealIslandNative PRIVATE ${Vulkan_INCLUDE_DIRS})
target_link_libraries(RealIslandNative PRIVATE Vulkan::Vulkan user32)
