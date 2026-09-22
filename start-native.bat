@echo off
setlocal
cd /d "%~dp0"
cmake -S native -B .build\native -A x64 || exit /b 1
cmake --build .build\native --config Release || exit /b 1
start "RealIsland Native" ".build\native\Release\RealIslandNative.exe"
