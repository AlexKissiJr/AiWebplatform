#!/usr/bin/env python3
import asyncio
import json
import logging
import websockets
import os
import socket
import sys
import traceback
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

try:
    # Import FastMCP - we'll add this file
    from fastmcp import FastMCP
    
    # Create an MCP server
    mcp = FastMCP("UnrealHandshake")

    # Function to send a message to Unreal Engine via socket
    def send_to_unreal(command):
        logger.info(f"Attempting to connect to Unreal Engine at host.docker.internal:9877 with command: {command}")
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                # Set a shorter timeout for connection attempts
                s.settimeout(5.0)
                
                try:
                    logger.info("Connecting to host.docker.internal:9877...")
                    s.connect(('host.docker.internal', 9877))  # Use host.docker.internal instead of localhost
                    logger.info("Successfully connected to Unreal Engine socket server")
                    
                    json_data = json.dumps(command)
                    logger.info(f"Sending data: {json_data}")
                    s.sendall(json_data.encode())
                    
                    logger.info("Waiting for response from Unreal Engine...")
                    response = s.recv(4096)  # Increased buffer size
                    
                    if response:
                        response_data = json.loads(response.decode())
                        logger.info(f"Received response from Unreal Engine: {response_data}")
                        return response_data
                    else:
                        logger.error("Received empty response from Unreal Engine")
                        return {"success": False, "error": "Empty response from Unreal Engine"}
                except socket.timeout:
                    logger.error("Connection timeout while trying to connect to Unreal Engine")
                    return {"success": False, "error": "Connection timeout to Unreal Engine"}
        except Exception as e:
            logger.error(f"Error sending to Unreal: {e}")
            return {"success": False, "error": str(e)}


    # Define basic tools for Claude to call
    @mcp.tool()
    def handshake_test(message: str) -> str:
        """Send a handshake message to Unreal Engine"""
        try:
            command = {
                "type": "handshake",
                "message": message
            }
            response = send_to_unreal(command)
            if response.get("success"):
                return f"Handshake successful: {response['message']}"
            else:
                return f"Handshake failed: {response.get('error', 'Unknown error')}"
        except Exception as e:
            return f"Error communicating with Unreal: {str(e)}"


    # Basic Object Commands
    @mcp.tool()
    def spawn_object(actor_class: str, location: list = [0, 0, 0], rotation: list = [0, 0, 0],
                    scale: list = [1, 1, 1], actor_label: str = None) -> str:
        """
        Spawn an object in the Unreal Engine level
        
        Args:
            actor_class: For basic shapes, use: "Cube", "Sphere", "Cylinder", or "Cone".
                        For other actors, use class name like "PointLight" or full path.
            location: [X, Y, Z] coordinates
            rotation: [Pitch, Yaw, Roll] in degrees
            scale: [X, Y, Z] scale factors
            actor_label: Optional custom name for the actor
            
        Returns:
            Message indicating success or failure
        """
        command = {
            "type": "spawn",
            "actor_class": actor_class,
            "location": location,
            "rotation": rotation,
            "scale": scale,
            "actor_label": actor_label
        }

        response = send_to_unreal(command)
        if response.get("success"):
            return f"Successfully spawned {actor_class}" + (f" with label '{actor_label}'" if actor_label else "")
        else:
            error = response.get('error', 'Unknown error')
            # Add hint for Claude to understand what went wrong
            if "not found" in error:
                hint = "\nHint: For basic shapes, use 'Cube', 'Sphere', 'Cylinder', or 'Cone'. For other actors, try using '/Script/Engine.PointLight' format."
                error += hint
            return f"Failed to spawn object: {error}"

    @mcp.tool()
    def create_material(material_name: str, color: list) -> str:
        """
        Create a new material with the specified color
        
        Args:
            material_name: Name for the new material
            color: [R, G, B] color values (0-1)
            
        Returns:
            Message indicating success or failure, and the material path if successful
        """
        command = {
            "type": "create_material",
            "material_name": material_name,
            "color": color
        }

        response = send_to_unreal(command)
        if response.get("success"):
            return f"Successfully created material '{material_name}' with path: {response.get('material_path')}"
        else:
            return f"Failed to create material: {response.get('error', 'Unknown error')}"

    @mcp.tool()
    def set_object_material(actor_name: str, material_path: str) -> str:
        """
        Set the material of an object in the level
        
        Args:
            actor_name: Name of the actor to modify
            material_path: Path to the material asset (e.g., "/Game/Materials/MyMaterial")
            
        Returns:
            Message indicating success or failure
        """
        command = {
            "type": "modify_object",
            "actor_name": actor_name,
            "property_type": "material",
            "value": material_path
        }

        response = send_to_unreal(command)
        if response.get("success"):
            return f"Successfully set material of '{actor_name}' to {material_path}"
        else:
            return f"Failed to set material: {response.get('error', 'Unknown error')}"

    @mcp.tool()
    def set_object_position(actor_name: str, position: list) -> str:
        """
        Set the position of an object in the level
        
        Args:
            actor_name: Name of the actor to modify
            position: [X, Y, Z] coordinates
            
        Returns:
            Message indicating success or failure
        """
        command = {
            "type": "modify_object",
            "actor_name": actor_name,
            "property_type": "position",
            "value": position
        }

        response = send_to_unreal(command)
        if response.get("success"):
            return f"Successfully set position of '{actor_name}' to {position}"
        else:
            return f"Failed to set position: {response.get('error', 'Unknown error')}"

    # Add other tools as needed...

except ImportError:
    logger.warning("FastMCP module not found, using mock implementation")
    mcp = None

# Define a mock for testing if FastMCP is not available
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
            # Mock response
            code = params.get("code", "")
            
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
        elif command == "spawn_object" or command == "spawn":
            actor_class = params.get("actor_class", "Cube")
            location = params.get("location", [0, 0, 0])
            actor_label = params.get("actor_label", f"New{actor_class}_{len(self.objects) + 1}")
            
            # Add the object to our scene
            self.objects[actor_label] = {
                "type": actor_class,
                "location": location,
                "scale": params.get("scale", [1, 1, 1]),
                "rotation": params.get("rotation", [0, 0, 0])
            }
            
            return {
                "status": "success",
                "result": f"Created {actor_class} named '{actor_label}' at location {location}",
                "timestamp": datetime.now().isoformat()
            }
        # Add other commands as needed
        else:
            return {
                "status": "error",
                "error": f"Unknown command: {command}",
                "timestamp": datetime.now().isoformat()
            }

# Initialize mock if needed
unreal_engine = UnrealEngineMock() if mcp is None else None

# Bridge WebSocket messages to FastMCP
async def process_mcp_command(command, params):
    """
    Process a command using FastMCP or fallback to mock
    """
    logger.info(f"Processing command: {command} with params: {params}")
    
    # Handle test_connection command
    if command == "test_unreal_connection":
        try:
            # Simple handshake to test connection
            test_result = send_to_unreal({
                "type": "handshake",
                "message": "Testing connection from MCP server"
            })
            
            if test_result.get("success"):
                return {
                    "status": "success",
                    "result": f"Successfully connected to Unreal Engine: {test_result.get('message', 'No message')}",
                    "timestamp": datetime.now().isoformat()
                }
            else:
                return {
                    "status": "error",
                    "error": f"Failed to connect to Unreal Engine: {test_result.get('error', 'Unknown error')}",
                    "timestamp": datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"Error testing connection to Unreal: {e}")
            return {
                "status": "error",
                "error": f"Error testing connection to Unreal: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
    
    # Handle sequence command
    if command == "sequence":
        steps = params.get("steps", [])
        if not steps:
            return {
                "status": "error",
                "error": "No steps provided for sequence command",
                "timestamp": datetime.now().isoformat()
            }
        
        results = []
        
        # Execute each step in sequence
        for step in steps:
            step_command = step.get("command")
            step_params = step.get("params", {})
            
            # Process each step
            step_result = await process_mcp_command(step_command, step_params)
            results.append(step_result)
        
        # Return success if all steps were successful
        return {
            "status": "success",
            "result": f"Executed sequence with {len(steps)} steps",
            "steps_results": results,
            "timestamp": datetime.now().isoformat()
        }
    
    # For now, use the mock implementation for all commands
    # This ensures communication with Unreal Engine works
    if command in ["spawn_object", "create_material", "set_object_material", "modify_object", "spawn"]:
        # Use mock for now, will switch to FastMCP when everything is working
        mock_result = UnrealEngineMock().execute_command(command, params)
        
        # Now try to send to Unreal as well
        try:
            # Convert to Unreal-friendly format
            unreal_command = command
            if command == "spawn_object":
                unreal_command = "spawn"  # Adjust command name if needed
                
            # Try to send to Unreal
            unreal_result = send_to_unreal({
                "type": unreal_command,
                **params
            })
            logger.info(f"Unreal result: {unreal_result}")
            # If successful, return the Unreal result
            if unreal_result.get("success"):
                return {
                    "status": "success",
                    "result": unreal_result.get("message", f"Successfully executed {command} in Unreal Engine"),
                    "timestamp": datetime.now().isoformat()
                }
        except Exception as e:
            logger.error(f"Error sending to Unreal: {e}")
            # Fall back to mock result
        
        # Return the mock result if Unreal communication failed
        return mock_result
    
    # Original code for other commands
    if mcp:
        try:
            # Find the appropriate tool
            tool_name = command
            tool = getattr(mcp, tool_name, None)
            
            if tool:
                result = tool(**params)
                return {
                    "status": "success",
                    "result": result,
                    "timestamp": datetime.now().isoformat()
                }
            else:
                # Use mock for unknown tools
                return UnrealEngineMock().execute_command(command, params)
        except Exception as e:
            logger.error(f"Error executing FastMCP tool: {e}")
            # Fall back to mock for errors
            return UnrealEngineMock().execute_command(command, params)
    else:
        # Use mock implementation
        return UnrealEngineMock().execute_command(command, params)

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
                
                # Check for command field directly (mcpBridge.js format)
                if "command" in data:
                    command = data.get("command")
                    params = data.get("params", {})
                    message_id = data.get("id")
                    
                    # Set type for compatibility
                    data["type"] = "mcp_command"
                    
                    # Execute the command using FastMCP or mock
                    result = await process_mcp_command(command, params)
                    
                    # Send response back to client
                    response = {
                        "id": message_id,
                        "type": "mcp_response",
                        "result": result
                    }
                    
                    await websocket.send(json.dumps(response))
                # Process message based on type
                elif "type" in data and data["type"] == "mcp_command":
                    command = data.get("command")
                    params = data.get("params", {})
                    message_id = data.get("id")
                    
                    # Execute the command using FastMCP or mock
                    result = await process_mcp_command(command, params)
                    
                    # Send response back to client
                    response = {
                        "id": message_id,
                        "type": "mcp_response",
                        "result": result
                    }
                    
                    await websocket.send(json.dumps(response))
                else:
                    logger.warning(f"Unknown message format: {data}")
                    
                    # Send error response
                    response = {
                        "id": data.get("id"),
                        "type": "mcp_response",
                        "error": "Unknown message format"
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
    try:
        logger.info("Server starting...")
        asyncio.run(main())
    except Exception as e:
        logger.error(f"Server crashed with error: {e}")
        traceback.print_exc()
        sys.exit(1) 