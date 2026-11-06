param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,
    [switch]$HideSources
)

$ErrorActionPreference = 'Stop'
$executablePath = (Resolve-Path -LiteralPath $Executable).Path
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sourcePath = Join-Path $projectRoot 'src'
$heldPath = Join-Path $projectRoot 'src.startup-probe-held'
$outputPath = Join-Path $projectRoot 'target/startup-check'
$startupTimeout = 10000
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
$probeProcess = $null
$sourcesMoved = $false
try {
    if ($HideSources) {
        $resolvedSource = (Resolve-Path -LiteralPath $sourcePath).Path
        $resolvedHeld = [IO.Path]::GetFullPath($heldPath)
        $workspacePrefix = $projectRoot + [IO.Path]::DirectorySeparatorChar
        if (-not $resolvedSource.StartsWith($workspacePrefix) -or
            -not $resolvedHeld.StartsWith($workspacePrefix) -or
            (Test-Path -LiteralPath $resolvedHeld)) {
            throw 'Source isolation paths are unsafe or already occupied.'
        }
        Move-Item -LiteralPath $resolvedSource -Destination $resolvedHeld
        $sourcesMoved = $true
    }
    $probeProcess = Start-Process -FilePath $executablePath -WorkingDirectory (Split-Path $executablePath) `
        -WindowStyle Hidden -RedirectStandardOutput (Join-Path $outputPath 'stdout.log') `
        -RedirectStandardError (Join-Path $outputPath 'stderr.log') -PassThru
    if ($probeProcess.WaitForExit($startupTimeout)) {
        $stderr = Get-Content (Join-Path $outputPath 'stderr.log') -Raw
        throw "Installed app exited during startup (code $($probeProcess.ExitCode)). $stderr"
    }
    $probeProcess.Refresh()
    if ($probeProcess.MainWindowHandle -eq 0) {
        throw 'The app stayed alive but did not create a desktop window.'
    }
    Write-Output "PASS: $executablePath stayed alive and created '$($probeProcess.MainWindowTitle)' with source isolation=$HideSources."
} finally {
    if ($sourcesMoved) {
        Move-Item -LiteralPath $heldPath -Destination $sourcePath
    }
    if ($probeProcess -and -not $probeProcess.HasExited) {
        Stop-Process -Id $probeProcess.Id
    }
}
