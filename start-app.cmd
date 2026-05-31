@echo off
setlocal
set NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe
if not exist "%NODE_EXE%" set NODE_EXE=node
if "%PORT%"=="" set PORT=5173
"%NODE_EXE%" app\server.mjs
