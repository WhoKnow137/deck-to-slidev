param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3200
)

$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
$runtimeDir = Join-Path $projectDir '.slidev-runtime'
$cacheDir = Join-Path $runtimeDir 'npm-cache'
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null

$previousTemp = $env:TEMP
$previousTmp = $env:TMP
$previousNpmCache = $env:npm_config_cache
$env:TEMP = $runtimeDir
$env:TMP = $runtimeDir
$env:npm_config_cache = $cacheDir

Push-Location -LiteralPath $projectDir
try {
  if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules/@slidev/cli'))) {
    Write-Host 'Installing Slidev dependencies...'
    & node (Join-Path $projectDir 'install-slidev.mjs')
    if ($LASTEXITCODE -ne 0) { throw "Slidev installation failed with exit code $LASTEXITCODE" }
  }

  & npm.cmd run dev -- --port $Port
  if ($LASTEXITCODE -ne 0) { throw "Slidev exited with code $LASTEXITCODE" }
}
finally {
  Pop-Location
  $env:TEMP = $previousTemp
  $env:TMP = $previousTmp
  $env:npm_config_cache = $previousNpmCache
}
