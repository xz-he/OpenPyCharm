param(
    [ValidateSet('dev', 'build', 'verify')]
    [string]$Task = 'dev'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$localTools = Join-Path (Split-Path $projectRoot -Parent) '.openpycharm-tools'
if (Test-Path (Join-Path $localTools 'cargo/bin/cargo.exe')) {
    $env:RUSTUP_HOME = Join-Path $localTools 'rustup'
    $env:CARGO_HOME = Join-Path $localTools 'cargo'
    $env:PATH = "$env:CARGO_HOME\bin;$env:PATH"
}
Push-Location $projectRoot
try {
    if (-not (Test-Path 'node_modules')) {
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    }
    switch ($Task) {
        'dev' { & pnpm dev:app }
        'build' { & pnpm tauri build --debug --bundles nsis }
        'verify' {
            & pnpm typecheck
            if ($LASTEXITCODE -ne 0) { throw 'Type checking failed.' }
            & pnpm exec vitest run --maxWorkers=1 src/features/app/__tests__ src/features/welcome/welcome.test.tsx src/workbench/TitleBar.test.tsx src/workbench/lightEdit.test.tsx scripts/dev-session.test.ts src/platform/locales/textCatalog.test.ts
        }
    }
    if ($LASTEXITCODE -ne 0) { throw "OpenPyCharm $Task failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}
