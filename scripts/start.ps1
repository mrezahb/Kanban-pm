$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

docker compose --project-directory $projectRoot up --build --detach
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
