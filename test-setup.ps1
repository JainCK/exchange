# Test script to verify setup before Docker

Write-Host "Testing Enhanced Trading Exchange Setup..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js version: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found. Please install Node.js first." -ForegroundColor Red
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version
    Write-Host "✓ npm version: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ npm not found." -ForegroundColor Red
    exit 1
}

# Navigate to orderbook-server
if (Test-Path "orderbook-server") {
    Set-Location orderbook-server
} else {
    Write-Host "✗ orderbook-server directory not found" -ForegroundColor Red
    exit 1
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ npm install failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green

Write-Host "Building TypeScript..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ TypeScript build failed" -ForegroundColor Red
    exit 1
}

Write-Host "✓ TypeScript build successful" -ForegroundColor Green

# Check if dist folder was created
if (Test-Path "dist") {
    Write-Host "✓ dist/ folder created" -ForegroundColor Green
    $distFiles = Get-ChildItem -Path "dist" -Recurse -File | Measure-Object
    Write-Host "  - $($distFiles.Count) files generated" -ForegroundColor Cyan
} else {
    Write-Host "✗ dist/ folder not found" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setup test completed successfully! 🎉" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Test locally: npm run dev" -ForegroundColor White
Write-Host "2. Test with Docker: docker-compose up --build" -ForegroundColor White
Write-Host ""
