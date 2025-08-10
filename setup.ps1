# Development environment setup script for Windows PowerShell

Write-Host "Setting up Enhanced Trading Exchange Orderbook Server..." -ForegroundColor Green

# Navigate to orderbook-server directory
if (Test-Path "orderbook-server") {
    Set-Location orderbook-server
} else {
    Write-Host "Error: orderbook-server directory not found" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Yellow
npm run build

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start the development server:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "To start with Docker (from WSL):" -ForegroundColor Cyan
Write-Host "  wsl" -ForegroundColor White
Write-Host "  cd /exchange" -ForegroundColor White
Write-Host "  docker-compose up --build" -ForegroundColor White
Write-Host ""
Write-Host "API will be available at:" -ForegroundColor Cyan
Write-Host "  HTTP: http://localhost:3000" -ForegroundColor White
Write-Host "  WebSocket: ws://localhost:3001" -ForegroundColor White
