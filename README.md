# Unreal Engine AI Assistant

This is a simple interface for interacting with Unreal Engine through natural language commands. It provides a web interface with permission dialogs similar to Claude's.

## Requirements

- Node.js
- Unreal Engine with WebSocket plugin enabled on port 9877

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open http://localhost:3001 in your browser

## Features

- Simple web interface for sending commands to Unreal Engine
- Claude-style permission dialog for each command
- Natural language parsing for creating objects, setting colors, and positions
- Direct WebSocket connection to Unreal Engine

## Command Examples

- "Create a red cube"
- "Spawn a blue sphere"
- "Create a green cylinder at position 100, 200, 50"
- "Delete all objects"

## How It Works

1. The web interface sends commands to the WebSocket server
2. Commands are formatted into the structure Unreal Engine expects:
   ```json
   {
     "spawn": {
       "actor_class": "Cube",
       "location": {"x": 0, "y": 0, "z": 100},
       "rotation": {"pitch": 0, "yaw": 0, "roll": 0},
       "scale": {"x": 1, "y": 1, "z": 1},
       "properties": {"color": {"r": 1, "g": 0, "b": 0, "a": 1}}
     }
   }
   ```
3. The formatted commands are sent to Unreal Engine on port 9877
4. Unreal Engine processes the commands and creates the specified objects

## Configuration

The WebSocket server runs on port 9879 and communicates with Unreal Engine on port 9877. You can modify these ports in the `final_client.js` file if needed. 