@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install Node.js, then run start.bat again.
  pause
  exit /b 1
)
if not exist "generated\kernels.json" (
  echo Compiling the CUDA source for WebGPU...
  call npm run build:kernels
  if errorlevel 1 (pause & exit /b 1)
)
start "" "http://localhost:5173"
node scripts/serve.mjs
pause
