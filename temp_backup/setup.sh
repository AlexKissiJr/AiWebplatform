#!/bin/bash

echo "Setting up AI Webplatform for Unreal Engine..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is required but not installed. Please install Node.js and try again."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Please install Python 3 and try again."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "pip3 is required but not installed. Please install pip and try again."
    exit 1
fi

echo "Installing backend dependencies..."
cd backend
npm install
cp .env.example .env
cd ..

echo "Installing frontend dependencies..."
cd frontend
npm install
cd ..

echo "Installing MCP server dependencies..."
cd mcp_server
pip3 install -r requirements.txt
cd ..

echo "Setup complete! You can now start the application using the following commands:"
echo ""
echo "Terminal 1 - Run the MCP server:"
echo "cd mcp_server && python3 mcp_server.py"
echo ""
echo "Terminal 2 - Run the backend:"
echo "cd backend && npm run dev"
echo ""
echo "Terminal 3 - Run the frontend:"
echo "cd frontend && npm run dev"
echo ""
echo "Or use Docker Compose to run all services:"
echo "docker-compose up"
echo ""
echo "The application will be available at http://localhost:3000" 