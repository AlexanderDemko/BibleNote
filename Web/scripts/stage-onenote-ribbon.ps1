$ErrorActionPreference = 'Stop'

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') {
  throw 'OneNote Ribbon can only be built on Windows.'
}

$webRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $webRoot 'windows\OneNoteRibbon'
$targetRoot = Join-Path $webRoot 'vendor\OneNoteRibbon'
$ribbonProject = Join-Path $sourceRoot 'RibbonAddIn\RibbonAddIn.csproj'
$registrarProject = Join-Path $sourceRoot 'Registrar\Registrar.csproj'
$frameworkMsBuild = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\MSBuild.exe'

$resolvedWebRoot = (Resolve-Path $webRoot).Path
if (Test-Path $targetRoot) {
  $resolvedTargetRoot = (Resolve-Path $targetRoot).Path
  if (-not $resolvedTargetRoot.StartsWith($resolvedWebRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to replace a staging directory outside Web: $resolvedTargetRoot"
  }
  Remove-Item -LiteralPath $resolvedTargetRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

dotnet build $registrarProject -c Release
if ($LASTEXITCODE -ne 0) {
  throw "OneNote Ribbon registrar build failed with exit code $LASTEXITCODE"
}
$registrarOutput = Join-Path $sourceRoot 'Registrar\bin\Release\net48'
Copy-Item -LiteralPath (Join-Path $registrarOutput 'BibleNote.OneNoteRibbon.Registrar.exe') -Destination $targetRoot
Copy-Item -LiteralPath (Join-Path $registrarOutput 'BibleNote.OneNoteRibbon.Registrar.exe.config') -Destination $targetRoot -ErrorAction SilentlyContinue

foreach ($generation in '2010', '2013', '2016') {
  & $frameworkMsBuild $ribbonProject /t:Rebuild /p:Configuration=Release /p:OfficeGeneration=$generation /nologo /verbosity:minimal
  if ($LASTEXITCODE -ne 0) {
    throw "OneNote Ribbon Office $generation build failed with exit code $LASTEXITCODE"
  }
  $generationTarget = Join-Path $targetRoot "Office$generation"
  New-Item -ItemType Directory -Force -Path $generationTarget | Out-Null
  $assemblyName = "BibleNote.OneNoteRibbon.Office$generation.dll"
  Copy-Item -LiteralPath (Join-Path $sourceRoot "RibbonAddIn\bin\Release\$assemblyName") -Destination $generationTarget
}

Write-Host "OneNote Ribbon staged to $targetRoot"
