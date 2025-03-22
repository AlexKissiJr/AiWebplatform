# AI Webplatform for Unreal Engine

A SaaS platform that translates natural language into Unreal Engine commands using the UnrealGenAISupport plugin and Model Control Protocol (MCP).

## Architecture

This project consists of three main components:

1. **Frontend**: Next.js application with a chat interface
2. **Backend**: Node.js server that communicates with the MCP server
3. **MCP Server**: Python WebSocket server that communicates with Unreal Engine

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker and Docker Compose (optional, for containerized deployment)

### Development Setup

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/AiWebplatform.git
cd AiWebplatform
```

2. **Setup the backend**

```bash
cd backend
npm install
cp .env.example .env
# Edit .env file with your configuration
```

3. **Setup the frontend**

```bash
cd frontend
npm install
```

4. **Setup the MCP server**

```bash
cd mcp_server
pip install -r requirements.txt
```

5. **Run the application in development mode**

In three separate terminal windows:

```bash
# Terminal 1 - Run the MCP server
cd mcp_server
python mcp_server.py

# Terminal 2 - Run the backend
cd backend
npm run dev

# Terminal 3 - Run the frontend
cd frontend
npm run dev
```

### Using Docker Compose

Alternatively, you can use Docker Compose to run all services:

```bash
docker-compose up
```

## Integrating with Unreal Engine

1. Install the [UnrealGenAISupport plugin](https://github.com/AlexKissiJr/UnrealGenAISupport) in your Unreal Engine project
2. Configure the plugin to connect to the MCP server
3. Start using the AI Webplatform to send commands to Unreal Engine

## Features

- Natural language processing for Unreal Engine commands
- Real-time communication between the chat interface and Unreal Engine
- Support for blueprint generation and code snippet creation

## Roadmap

- [ ] User authentication and session management
- [ ] Subscription and billing integration
- [ ] Advanced natural language processing for complex commands
- [ ] Blueprint visualization in the web interface
- [ ] Code snippet highlighting and editing

## License

MIT

## Acknowledgments

- [UnrealGenAISupport plugin](https://github.com/AlexKissiJr/UnrealGenAISupport) for the Unreal Engine integration
- Model Control Protocol (MCP) for the communication standard 