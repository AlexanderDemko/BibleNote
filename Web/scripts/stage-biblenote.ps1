$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$bibleNoteProjectPath = (Resolve-Path (Join-Path $repoRoot '..\Api\Application\Application.csproj')).Path
$bibleNoteProjectDir = Split-Path -Parent $bibleNoteProjectPath
$runtimeIdentifier = 'win-x64'
$sourceDir = Join-Path $bibleNoteProjectDir "bin\Release\net10.0\$runtimeIdentifier"
$targetDir = Join-Path $repoRoot 'vendor\BibleNote'

dotnet build $bibleNoteProjectPath -c Release -r $runtimeIdentifier --self-contained true -p:GenerateCode=False
if ($LASTEXITCODE -ne 0) {
  throw "BibleNote build failed with exit code $LASTEXITCODE"
}
if (-not (Test-Path (Join-Path $sourceDir 'coreclr.dll'))) {
  throw "Self-contained BibleNote runtime was not produced at $sourceDir"
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
Copy-Item -Path (Join-Path $sourceDir '*') -Destination $targetDir -Recurse -Force

Write-Host "BibleNote staged to $targetDir"

