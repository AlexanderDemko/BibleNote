$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $repoRoot 'vendor\node'
$nodePath = (Get-Command node.exe).Source

if (-not (Test-Path $nodePath)) {
  throw "node.exe was not found."
}

$resolvedRepoRoot = (Resolve-Path $repoRoot).Path
if (Test-Path $targetDir) {
  $resolvedTargetDir = (Resolve-Path $targetDir).Path
  if (-not $resolvedTargetDir.StartsWith($resolvedRepoRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to delete a staging directory outside the repository: $resolvedTargetDir"
  }
  Remove-Item -LiteralPath $resolvedTargetDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Copy-Item -LiteralPath $nodePath -Destination (Join-Path $targetDir 'node.exe') -Force

Write-Host "Node staged to $targetDir"
