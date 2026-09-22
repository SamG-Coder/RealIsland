#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#define VK_USE_PLATFORM_WIN32_KHR
#include <windows.h>
#include <vulkan/vulkan.h>
#include "terrain.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
HWND window = nullptr;
bool running = true;
VkInstance instance = VK_NULL_HANDLE;
VkSurfaceKHR surface = VK_NULL_HANDLE;
VkPhysicalDevice gpu = VK_NULL_HANDLE;
VkDevice device = VK_NULL_HANDLE;
VkQueue queue = VK_NULL_HANDLE;
uint32_t queueFamily = 0;
VkSwapchainKHR swapchain = VK_NULL_HANDLE;
std::vector<VkImage> images;
VkCommandPool pool = VK_NULL_HANDLE;
VkCommandBuffer command = VK_NULL_HANDLE;
VkSemaphore acquired = VK_NULL_HANDLE, rendered = VK_NULL_HANDLE;
VkFence fence = VK_NULL_HANDLE;
VkBuffer staging = VK_NULL_HANDLE;
VkDeviceMemory stagingMemory = VK_NULL_HANDLE;
void* mapped = nullptr;

void verify(VkResult result, const char* what) {
  if (result != VK_SUCCESS) throw std::runtime_error(std::string(what) + " (Vulkan " + std::to_string(result) + ")");
}

LRESULT CALLBACK windowProc(HWND hwnd, UINT message, WPARAM wp, LPARAM lp) {
  if (message == WM_CLOSE) { running = false; DestroyWindow(hwnd); return 0; }
  if (message == WM_DESTROY) { running = false; PostQuitMessage(0); return 0; }
  if (message == WM_KEYDOWN && wp == VK_ESCAPE) { running = false; DestroyWindow(hwnd); return 0; }
  return DefWindowProcW(hwnd, message, wp, lp);
}

void createWindow(HINSTANCE app) {
  WNDCLASSW wc{};
  wc.lpfnWndProc = windowProc;
  wc.hInstance = app;
  wc.lpszClassName = L"RealIslandNativeWindow";
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
  wc.style = CS_OWNDC;
  if (!RegisterClassW(&wc)) throw std::runtime_error("RegisterClass failed");
  RECT rect{0,0,kWidth,kHeight};
  AdjustWindowRect(&rect, WS_OVERLAPPEDWINDOW & ~WS_THICKFRAME & ~WS_MAXIMIZEBOX, FALSE);
  window = CreateWindowExW(0,wc.lpszClassName,L"RealIsland terrain viewer - Vulkan + CUDA",
    WS_OVERLAPPEDWINDOW & ~WS_THICKFRAME & ~WS_MAXIMIZEBOX,
    CW_USEDEFAULT,CW_USEDEFAULT,rect.right-rect.left,rect.bottom-rect.top,
    nullptr,nullptr,app,nullptr);
  if (!window) throw std::runtime_error("CreateWindow failed");
  ShowWindow(window, SW_SHOW);
}

uint32_t memoryType(uint32_t bits, VkMemoryPropertyFlags flags) {
  VkPhysicalDeviceMemoryProperties properties{};
  vkGetPhysicalDeviceMemoryProperties(gpu, &properties);
  for (uint32_t i=0;i<properties.memoryTypeCount;i++)
    if ((bits & (1u<<i)) && (properties.memoryTypes[i].propertyFlags & flags)==flags) return i;
  throw std::runtime_error("No host-visible Vulkan memory type");
}

void initializeVulkan(HINSTANCE app) {
  VkApplicationInfo ai{VK_STRUCTURE_TYPE_APPLICATION_INFO};
  ai.pApplicationName = "RealIsland Native";
  ai.apiVersion = VK_API_VERSION_1_0;
  const char* extensions[]{VK_KHR_SURFACE_EXTENSION_NAME,VK_KHR_WIN32_SURFACE_EXTENSION_NAME};
  VkInstanceCreateInfo ici{VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO};
  ici.pApplicationInfo=&ai; ici.enabledExtensionCount=2; ici.ppEnabledExtensionNames=extensions;
  verify(vkCreateInstance(&ici,nullptr,&instance),"vkCreateInstance");
  VkWin32SurfaceCreateInfoKHR sci{VK_STRUCTURE_TYPE_WIN32_SURFACE_CREATE_INFO_KHR};
  sci.hinstance=app; sci.hwnd=window;
  verify(vkCreateWin32SurfaceKHR(instance,&sci,nullptr,&surface),"vkCreateWin32SurfaceKHR");

  uint32_t count=0;
  verify(vkEnumeratePhysicalDevices(instance,&count,nullptr),"vkEnumeratePhysicalDevices");
  if (!count) throw std::runtime_error("No Vulkan GPU found");
  std::vector<VkPhysicalDevice> devices(count);
  verify(vkEnumeratePhysicalDevices(instance,&count,devices.data()),"vkEnumeratePhysicalDevices");
  for (auto candidate: devices) {
    VkPhysicalDeviceProperties props{}; vkGetPhysicalDeviceProperties(candidate,&props);
    uint32_t familyCount=0; vkGetPhysicalDeviceQueueFamilyProperties(candidate,&familyCount,nullptr);
    std::vector<VkQueueFamilyProperties> families(familyCount);
    vkGetPhysicalDeviceQueueFamilyProperties(candidate,&familyCount,families.data());
    for(uint32_t i=0;i<familyCount;i++) {
      VkBool32 present=VK_FALSE;
      vkGetPhysicalDeviceSurfaceSupportKHR(candidate,i,surface,&present);
      if (present && (families[i].queueFlags & VK_QUEUE_GRAPHICS_BIT) &&
          (families[i].queueFlags & VK_QUEUE_TRANSFER_BIT) &&
          props.deviceType==VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU) {
        gpu=candidate; queueFamily=i; break;
      }
    }
    if (gpu) break;
  }
  if (!gpu) throw std::runtime_error("No discrete Vulkan GPU with a present queue found");
  float priority=1.0f;
  VkDeviceQueueCreateInfo qci{VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO};
  qci.queueFamilyIndex=queueFamily; qci.queueCount=1; qci.pQueuePriorities=&priority;
  const char* deviceExtensions[]{VK_KHR_SWAPCHAIN_EXTENSION_NAME};
  VkDeviceCreateInfo dci{VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO};
  dci.queueCreateInfoCount=1; dci.pQueueCreateInfos=&qci;
  dci.enabledExtensionCount=1; dci.ppEnabledExtensionNames=deviceExtensions;
  verify(vkCreateDevice(gpu,&dci,nullptr,&device),"vkCreateDevice");
  vkGetDeviceQueue(device,queueFamily,0,&queue);

  VkSurfaceCapabilitiesKHR caps{};
  verify(vkGetPhysicalDeviceSurfaceCapabilitiesKHR(gpu,surface,&caps),"surface capabilities");
  uint32_t formatCount=0;
  verify(vkGetPhysicalDeviceSurfaceFormatsKHR(gpu,surface,&formatCount,nullptr),"surface formats");
  std::vector<VkSurfaceFormatKHR> formats(formatCount);
  verify(vkGetPhysicalDeviceSurfaceFormatsKHR(gpu,surface,&formatCount,formats.data()),"surface formats");
  VkSurfaceFormatKHR format=formats.at(0);
  for(auto candidate:formats) if(candidate.format==VK_FORMAT_B8G8R8A8_UNORM || candidate.format==VK_FORMAT_B8G8R8A8_SRGB) {format=candidate;break;}
  // The CUDA kernel emits packed RGBA bytes. Select the corresponding surface
  // format so a plain Vulkan transfer presents those exact pixels.
  bool rgba=false;
  for(auto candidate:formats) if(candidate.format==VK_FORMAT_R8G8B8A8_UNORM) {format=candidate;rgba=true;break;}
  if (!rgba) throw std::runtime_error("Swapchain lacks VK_FORMAT_R8G8B8A8_UNORM");
  if (!(caps.supportedUsageFlags & VK_IMAGE_USAGE_TRANSFER_DST_BIT))
    throw std::runtime_error("Swapchain images cannot receive Vulkan transfers");
  uint32_t imageCount=std::max(2u,caps.minImageCount);
  if (caps.maxImageCount) imageCount=std::min(imageCount,caps.maxImageCount);
  VkExtent2D extent{uint32_t(kWidth),uint32_t(kHeight)};
  if (caps.currentExtent.width!=UINT32_MAX) extent=caps.currentExtent;
  if (extent.width!=kWidth || extent.height!=kHeight)
    throw std::runtime_error("Unexpected window surface extent");
  VkSwapchainCreateInfoKHR swap{VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR};
  swap.surface=surface; swap.minImageCount=imageCount; swap.imageFormat=format.format;
  swap.imageColorSpace=format.colorSpace; swap.imageExtent=extent; swap.imageArrayLayers=1;
  swap.imageUsage=VK_IMAGE_USAGE_TRANSFER_DST_BIT; swap.imageSharingMode=VK_SHARING_MODE_EXCLUSIVE;
  swap.preTransform=caps.currentTransform;
  swap.compositeAlpha=(caps.supportedCompositeAlpha & VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR)
    ? VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR : VK_COMPOSITE_ALPHA_INHERIT_BIT_KHR;
  swap.presentMode=VK_PRESENT_MODE_FIFO_KHR; swap.clipped=VK_TRUE;
  verify(vkCreateSwapchainKHR(device,&swap,nullptr,&swapchain),"vkCreateSwapchainKHR");
  verify(vkGetSwapchainImagesKHR(device,swapchain,&imageCount,nullptr),"swapchain images");
  images.resize(imageCount);
  verify(vkGetSwapchainImagesKHR(device,swapchain,&imageCount,images.data()),"swapchain images");

  VkBufferCreateInfo bi{VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO};
  bi.size=VkDeviceSize(kWidth)*kHeight*4; bi.usage=VK_BUFFER_USAGE_TRANSFER_SRC_BIT;
  bi.sharingMode=VK_SHARING_MODE_EXCLUSIVE;
  verify(vkCreateBuffer(device,&bi,nullptr,&staging),"vkCreateBuffer");
  VkMemoryRequirements requirements{}; vkGetBufferMemoryRequirements(device,staging,&requirements);
  VkMemoryAllocateInfo allocation{VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO};
  allocation.allocationSize=requirements.size;
  allocation.memoryTypeIndex=memoryType(requirements.memoryTypeBits,
    VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
  verify(vkAllocateMemory(device,&allocation,nullptr,&stagingMemory),"vkAllocateMemory");
  verify(vkBindBufferMemory(device,staging,stagingMemory,0),"vkBindBufferMemory");
  verify(vkMapMemory(device,stagingMemory,0,bi.size,0,&mapped),"vkMapMemory");

  VkCommandPoolCreateInfo pci{VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO};
  pci.queueFamilyIndex=queueFamily; pci.flags=VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;
  verify(vkCreateCommandPool(device,&pci,nullptr,&pool),"vkCreateCommandPool");
  VkCommandBufferAllocateInfo cai{VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO};
  cai.commandPool=pool; cai.level=VK_COMMAND_BUFFER_LEVEL_PRIMARY; cai.commandBufferCount=1;
  verify(vkAllocateCommandBuffers(device,&cai,&command),"vkAllocateCommandBuffers");
  VkSemaphoreCreateInfo semi{VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO};
  verify(vkCreateSemaphore(device,&semi,nullptr,&acquired),"acquire semaphore");
  verify(vkCreateSemaphore(device,&semi,nullptr,&rendered),"render semaphore");
  VkFenceCreateInfo fi{VK_STRUCTURE_TYPE_FENCE_CREATE_INFO}; fi.flags=VK_FENCE_CREATE_SIGNALED_BIT;
  verify(vkCreateFence(device,&fi,nullptr,&fence),"vkCreateFence");
}

void present() {
  verify(vkWaitForFences(device,1,&fence,VK_TRUE,UINT64_MAX),"vkWaitForFences");
  uint32_t index=0;
  verify(vkAcquireNextImageKHR(device,swapchain,UINT64_MAX,acquired,VK_NULL_HANDLE,&index),"acquire image");
  verify(vkResetFences(device,1,&fence),"vkResetFences");
  verify(vkResetCommandBuffer(command,0),"vkResetCommandBuffer");
  VkCommandBufferBeginInfo begin{VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO};
  begin.flags=VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
  verify(vkBeginCommandBuffer(command,&begin),"vkBeginCommandBuffer");
  VkImageMemoryBarrier toCopy{VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER};
  toCopy.oldLayout=VK_IMAGE_LAYOUT_UNDEFINED;
  toCopy.newLayout=VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
  toCopy.srcQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;
  toCopy.dstQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;
  toCopy.image=images[index]; toCopy.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;
  toCopy.subresourceRange.levelCount=1; toCopy.subresourceRange.layerCount=1;
  toCopy.dstAccessMask=VK_ACCESS_TRANSFER_WRITE_BIT;
  vkCmdPipelineBarrier(command,VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,VK_PIPELINE_STAGE_TRANSFER_BIT,
    0,0,nullptr,0,nullptr,1,&toCopy);
  VkBufferImageCopy region{};
  region.imageSubresource.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;
  region.imageSubresource.layerCount=1;
  region.imageExtent={uint32_t(kWidth),uint32_t(kHeight),1};
  vkCmdCopyBufferToImage(command,staging,images[index],VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,1,&region);
  VkImageMemoryBarrier toPresent=toCopy;
  toPresent.oldLayout=VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
  toPresent.newLayout=VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;
  toPresent.srcAccessMask=VK_ACCESS_TRANSFER_WRITE_BIT;
  toPresent.dstAccessMask=0;
  vkCmdPipelineBarrier(command,VK_PIPELINE_STAGE_TRANSFER_BIT,VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT,
    0,0,nullptr,0,nullptr,1,&toPresent);
  verify(vkEndCommandBuffer(command),"vkEndCommandBuffer");
  VkPipelineStageFlags waitStage=VK_PIPELINE_STAGE_TRANSFER_BIT;
  VkSubmitInfo submit{VK_STRUCTURE_TYPE_SUBMIT_INFO};
  submit.waitSemaphoreCount=1; submit.pWaitSemaphores=&acquired; submit.pWaitDstStageMask=&waitStage;
  submit.commandBufferCount=1; submit.pCommandBuffers=&command;
  submit.signalSemaphoreCount=1; submit.pSignalSemaphores=&rendered;
  verify(vkQueueSubmit(queue,1,&submit,fence),"vkQueueSubmit");
  VkPresentInfoKHR pi{VK_STRUCTURE_TYPE_PRESENT_INFO_KHR};
  pi.waitSemaphoreCount=1; pi.pWaitSemaphores=&rendered;
  pi.swapchainCount=1; pi.pSwapchains=&swapchain; pi.pImageIndices=&index;
  verify(vkQueuePresentKHR(queue,&pi),"vkQueuePresentKHR");
  verify(vkQueueWaitIdle(queue),"vkQueueWaitIdle");
}

void cleanup() {
  if(device) vkDeviceWaitIdle(device);
  if(device && mapped) vkUnmapMemory(device,stagingMemory);
  if(device && fence) vkDestroyFence(device,fence,nullptr);
  if(device && rendered) vkDestroySemaphore(device,rendered,nullptr);
  if(device && acquired) vkDestroySemaphore(device,acquired,nullptr);
  if(device && pool) vkDestroyCommandPool(device,pool,nullptr);
  if(device && staging) vkDestroyBuffer(device,staging,nullptr);
  if(device && stagingMemory) vkFreeMemory(device,stagingMemory,nullptr);
  if(device && swapchain) vkDestroySwapchainKHR(device,swapchain,nullptr);
  if(device) vkDestroyDevice(device,nullptr);
  if(instance && surface) vkDestroySurfaceKHR(instance,surface,nullptr);
  if(instance) vkDestroyInstance(instance,nullptr);
  shutdownTerrain();
}
}

int WINAPI wWinMain(HINSTANCE app,HINSTANCE,LPWSTR,int) {
  try {
    createWindow(app);
    initializeVulkan(app);
    char error[512]{};
    if(!initializeTerrain(1741,error,sizeof(error))) throw std::runtime_error(error);
    Camera camera{0.0f,300.0f,1250.0f,3.14159265f,-.17f};
    auto before=std::chrono::steady_clock::now();
    while(running) {
      MSG msg{};
      while(PeekMessageW(&msg,nullptr,0,0,PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
      if(!running) break;
      auto now=std::chrono::steady_clock::now();
      float dt=std::min(.1f,std::chrono::duration<float>(now-before).count()); before=now;
      float speed=(GetAsyncKeyState(VK_SHIFT)&0x8000)?800.0f:220.0f;
      if(GetAsyncKeyState(VK_LEFT)&0x8000) camera.yaw-=dt*.9f;
      if(GetAsyncKeyState(VK_RIGHT)&0x8000) camera.yaw+=dt*.9f;
      if(GetAsyncKeyState(VK_UP)&0x8000) camera.pitch=std::min(.75f,camera.pitch+dt*.7f);
      if(GetAsyncKeyState(VK_DOWN)&0x8000) camera.pitch=std::max(-1.25f,camera.pitch-dt*.7f);
      float forward=((GetAsyncKeyState('W')&0x8000)?1.0f:0.0f)-((GetAsyncKeyState('S')&0x8000)?1.0f:0.0f);
      float side=((GetAsyncKeyState('D')&0x8000)?1.0f:0.0f)-((GetAsyncKeyState('A')&0x8000)?1.0f:0.0f);
      camera.x+=dt*speed*(std::sin(camera.yaw)*forward+std::cos(camera.yaw)*side);
      camera.z+=dt*speed*(std::cos(camera.yaw)*forward-std::sin(camera.yaw)*side);
      camera.y+=dt*speed*.6f*(((GetAsyncKeyState('E')&0x8000)?1.0f:0.0f)-((GetAsyncKeyState('Q')&0x8000)?1.0f:0.0f));
      camera.x=std::clamp(camera.x,-1450.0f,1450.0f);
      camera.z=std::clamp(camera.z,-1450.0f,1450.0f);
      camera.y=std::clamp(camera.y,5.0f,900.0f);
      if(!renderTerrain(camera,static_cast<std::uint32_t*>(mapped),error,sizeof(error))) throw std::runtime_error(error);
      present();
    }
    cleanup(); return 0;
  } catch(const std::exception& e) {
    cleanup();
    MessageBoxA(window,e.what(),"RealIsland Native startup error",MB_ICONERROR|MB_OK);
    return 1;
  }
}
