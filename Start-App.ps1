$ErrorActionPreference = "Stop"
$node = "C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  $node = "node"
}

if (-not $env:PORT) {
  $env:PORT = "5173"
}
& $node app/server.mjs
