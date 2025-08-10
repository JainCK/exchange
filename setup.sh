#!/bin/bash

# Development environment setup script for WSL

echo "Setting up Enhanced Trading Exchange Orderbook Server..."

# Check if we're in the right directory
if [ ! -d "orderbook-server" ]; then
    echo "Error: orderbook-server directory not found"
    echo "Please navigate to the exchange project directory first"
    exit 1
fi

# Navigate to orderbook-server directory
cd orderbook-server

# Install dependencies
echo "Installing dependencies..."
npm install

# Build TypeScript
echo "Building TypeScript..."
npm run build

echo "Setup complete!"
echo ""
echo "To start the development server:"
echo "  npm run dev"
echo ""
echo "To start with Docker:"
echo "  cd .."
echo "  docker-compose up --build"
echo ""
echo "API will be available at:"
echo "  HTTP: http://localhost:3000"
echo "  WebSocket: ws://localhost:3001"
