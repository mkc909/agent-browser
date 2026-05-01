# agent-browser PowerShell wrapper for Windows
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

# Check for native Windows binary first
$nativeBinary = Join-Path $scriptDir "agent-browser-win32-x64.exe"
if (Test-Path $nativeBinary) {
    & $nativeBinary @args
    exit $LASTEXITCODE
}

# Fall back to Node.js daemon
$daemonPath = Join-Path $repoRoot "dist\daemon.js"
if (Test-Path $daemonPath) {
    node $daemonPath @args
    exit $LASTEXITCODE
}

Write-Error "Cannot find agent-browser executable or daemon"
exit 1
