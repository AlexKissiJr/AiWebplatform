#!/usr/bin/env python3
import asyncio
import json
import logging
import websockets
import os
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('mcp_server')

# WebSocket server configuration
PORT = int(os.environ.get('MCP_PORT', 8765))
HOST = os.environ.get('MCP_HOST', '0.0.0.0')

# Store active connections
clients = {}
unreal_socket = None

# Mock Unreal Engine integration
class UnrealEngineMock:
    def __init__(self):
        self.objects = {
            "Cube_1": {"type": "StaticMesh", "location": [0, 0, 0], "scale": [1, 1, 1]},
            "Camera_1": {"type": "Camera", "location": [0, -10, 2], "rotation": [0, 0, 0]}
        }
        self.blueprints = {}
    
    def execute_command(self, command, params):
        """
        Mock execution of Unreal Engine commands.
        In a real implementation, this would connect to the Unreal Engine.
        """
        logger.info(f"Executing command: {command} with params: {params}")
        
        if command == "execute_blender_code":
            # This is where we'd translate the command to Unreal Engine
            # For now, we'll just log it and return a mock response
            code = params.get("code", "")
            
            # Check if it's a blueprint creation request
            if "blueprint" in code.lower():
                blueprint_name = f"Blueprint_{len(self.blueprints) + 1}"
                self.blueprints[blueprint_name] = {
                    "code": code,
                    "created_at": datetime.now().isoformat()
                }
                return {
                    "status": "success",
                    "result": f"Created blueprint '{blueprint_name}' with the following logic:\n{code}",
                    "timestamp": datetime.now().isoformat()
                }
            
            return {
                "status": "success",
                "result": f"Executed code in Unreal Engine: {code}",
                "timestamp": datetime.now().isoformat()
            }
        elif command == "get_scene_info":
            # Return the objects in the scene
            return {
                "status": "success",
                "result": {
                    "objects": [
                        {"name": name, **props} for name, props in self.objects.items()
                    ],
                    "blueprints": list(self.blueprints.keys()),
                    "timestamp": datetime.now().isoformat()
                }
            }
        elif command == "create_object":
            obj_type = params.get("type", "CUBE")
            obj_name = params.get("name", f"New{obj_type}")
            location = params.get("location", [0, 0, 0])
            
            # Add the object to our scene
            self.objects[obj_name] = {
                "type": self._get_unreal_type(obj_type),
                "location": location,
                "scale": params.get("scale", [1, 1, 1])
            }
            
            return {
                "status": "success",
                "result": f"Created {obj_type} named '{obj_name}' at location {location}",
                "timestamp": datetime.now().isoformat()
            }
        elif command == "modify_object":
            obj_name = params.get("name")
            if obj_name not in self.objects:
                return {
                    "status": "error",
                    "error": f"Object '{obj_name}' not found",
                    "timestamp": datetime.now().isoformat()
                }
            
            # Update object properties
            if "location" in params:
                self.objects[obj_name]["location"] = params["location"]
            if "scale" in params:
                self.objects[obj_name]["scale"] = params["scale"]
            
            return {
                "status": "success",
                "result": f"Modified object '{obj_name}'",
                "timestamp": datetime.now().isoformat()
            }
        elif command == "delete_object":
            obj_name = params.get("name")
            if obj_name not in self.objects:
                return {
                    "status": "error",
                    "error": f"Object '{obj_name}' not found",
                    "timestamp": datetime.now().isoformat()
                }
            
            # Remove the object
            del self.objects[obj_name]
            
            return {
                "status": "success",
                "result": f"Deleted object '{obj_name}'",
                "timestamp": datetime.now().isoformat()
            }
        else:
            return {
                "status": "error",
                "error": f"Unknown command: {command}",
                "timestamp": datetime.now().isoformat()
            }
    
    def _get_unreal_type(self, obj_type):
        """Map simple object types to Unreal Engine types."""
        type_mapping = {
            "CUBE": "StaticMesh",
            "SPHERE": "StaticMesh",
            "PLANE": "StaticMesh",
            "CYLINDER": "StaticMesh",
            "CONE": "StaticMesh",
            "CAMERA": "Camera",
            "LIGHT": "Light"
        }
        return type_mapping.get(obj_type.upper(), "StaticMesh")

# Initialize mock
unreal_engine = UnrealEngineMock()

async def handle_client(websocket, path):
    """
    Handle WebSocket client connections.
    """
    client_id = id(websocket)
    clients[client_id] = websocket
    logger.info(f"Client {client_id} connected")
    
    try:
        async for message in websocket:
            logger.info(f"Received message from client {client_id}: {message}")
            
            try:
                data = json.loads(message)
                
                # Process message based on type
                if "type" in data and data["type"] == "mcp_command":
                    command = data.get("command")
                    params = data.get("params", {})
                    message_id = data.get("id")
                    
                    # Execute the command in Unreal Engine
                    result = unreal_engine.execute_command(command, params)
                    
                    # Send response back to client
                    response = {
                        "id": message_id,
                        "type": "mcp_response",
                        "result": result
                    }
                    
                    await websocket.send(json.dumps(response))
                else:
                    logger.warning(f"Unknown message type: {data.get('type')}")
                    
                    # Send error response
                    response = {
                        "id": data.get("id"),
                        "type": "mcp_response",
                        "error": "Unknown message type"
                    }
                    
                    await websocket.send(json.dumps(response))
                    
            except json.JSONDecodeError:
                logger.error(f"Invalid JSON: {message}")
                await websocket.send(json.dumps({
                    "type": "mcp_response",
                    "error": "Invalid JSON"
                }))
                
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Client {client_id} disconnected")
    finally:
        if client_id in clients:
            del clients[client_id]

async def main():
    """
    Start the WebSocket server.
    """
    logger.info(f"Starting MCP server on {HOST}:{PORT}")
    
    async with websockets.serve(handle_client, HOST, PORT):
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    asyncio.run(main()) 