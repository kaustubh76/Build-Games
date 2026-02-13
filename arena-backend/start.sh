#!/bin/bash

echo "🎮 Starting Warriors Arena Backend..."

# Check if .env file exists
if [ ! -f .env ]; then
  echo "⚠️ Warning: .env file not found. Creating from example..."
  echo "PORT=3002" > .env
  echo "FRONTEND_URL=http://localhost:3000" >> .env
  echo "📝 Please edit .env file if you need custom configuration"
fi

# Build and start the service
echo "🔨 Building backend..."
npm run build

echo "🚀 Starting backend on port 3002..."
npm start 