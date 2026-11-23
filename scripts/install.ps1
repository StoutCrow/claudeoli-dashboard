# Tests, builds and copies the plugin into one vault on this PC:
#   powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Vault "<path to the vault>"
# Without -Vault it reads the path from dev\vault.local.txt (one line, kept out of git).
# It copies only main.js, manifest.json and styles.css: the vault's data.json is never touched.
param([string]$Vault)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Vault) {
    $local = Join-Path $root "dev\vault.local.txt"
    if (-not (Test-Path $local)) { throw "Pass -Vault <path>, or put the vault path in dev\vault.local.txt" }
    $Vault = (Get-Content $local -TotalCount 1).Trim()
}
if (-not (Test-Path (Join-Path $Vault ".obsidian"))) { throw "$Vault is not an Obsidian vault (no .obsidian folder)" }

npm test
if ($LASTEXITCODE -ne 0) { throw "tests failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

$dest = Join-Path $Vault ".obsidian\plugins\claudeoli-dashboard"
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in "main.js", "manifest.json", "styles.css") {
    # Copy-Item keeps the bytes as built (Node writes UTF-8 without a byte-order mark).
    Copy-Item (Join-Path $root $f) (Join-Path $dest $f) -Force
}
$first = [IO.File]::ReadAllBytes((Join-Path $dest "manifest.json"))[0]
if ($first -ne 123) { throw "manifest.json in the vault doesn't start with '{' (byte $first): a byte-order mark?" }
Write-Host "Installed $((Get-Content (Join-Path $dest 'manifest.json') -Raw | ConvertFrom-Json).version) into $dest (data.json untouched)."
