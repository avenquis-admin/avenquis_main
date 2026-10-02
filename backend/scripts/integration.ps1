#!/usr/bin/env pwsh
# integration.ps1 - B10 integration script
$ErrorActionPreference = "Stop"

function Ensure-Postgres {
  $container = docker ps --filter "name=avenquis-postgres" --format "{{.Names}}"
  if (-not $container) {
    Write-Host "Starting PostgreSQL container..."
    docker run -d --name avenquis-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_USER=postgres -p 5432:5432 postgres:15-alpine
    Write-Host "Waiting for PostgreSQL to be ready..."
    Start-Sleep -Seconds 10
  } else {
    Write-Host "PostgreSQL container already running."
  }
}

function Run-Migrations {
  Write-Host "Running migrations and seed on test DB..."
  $env:NODE_ENV = "test"
  npm run db:generate
  npm run db:migrate
  npm run db:seed
}

function Start-Backend {
  Write-Host "Starting backend..."
  $backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -NoNewWindow -PassThru
  $global:backendPid = $backendProcess.Id
  Start-Sleep -Seconds 5
}

function Start-Frontend {
  Write-Host "Starting Frontend..."
  Push-Location "../avenquis-fe"
  $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -NoNewWindow -PassThru
  $global:frontendPid = $frontendProcess.Id
  Pop-Location
  Start-Sleep -Seconds 5
}

function Start-ControlPanel {
  Write-Host "Starting Control Panel..."
  Push-Location "../avenquis-control-panel"
  $controlProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev" -NoNewWindow -PassThru
  $global:controlPid = $controlProcess.Id
  Pop-Location
  Start-Sleep -Seconds 5
}

function Run-IntegrationTests {
  Write-Host "Running integration tests..."
  npm run test:integration
  if ($LASTEXITCODE -ne 0) {
    throw "Integration tests failed."
  }
}

function Cleanup {
  Write-Host "Cleaning up background processes..."
  if ($global:backendPid) { Stop-Process -Id $global:backendPid -Force }
  if ($global:frontendPid) { Stop-Process -Id $global:frontendPid -Force }
  if ($global:controlPid) { Stop-Process -Id $global:controlPid -Force }
  Write-Host "Done."
}

try {
  Ensure-Postgres
  Run-Migrations
  Start-Backend
  Start-Frontend
  Start-ControlPanel
  Run-IntegrationTests
} finally {
  Cleanup
}
