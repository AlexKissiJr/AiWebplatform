import inspect
import json
import logging
import asyncio
import functools
import websockets
from typing import Any, Callable, Dict, List, Optional, Union, get_type_hints

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fastmcp")

class FastMCP:
    """
    Fast MCP (Model Control Protocol) implementation.
    
    This class provides a lightweight framework for defining tools that can be
    exposed to language models for execution, following the Model Control Protocol.
    """
    
    def __init__(self, name: str):
        """
        Initialize a new FastMCP instance.
        
        Args:
            name: A name for this MCP instance
        """
        self.name = name
        self.tools = {}
        self.ws_server = None
        self.clients = set()
        self.client_queues = {}
        
    def tool(self, func: Optional[Callable] = None):
        """
        Decorator to register a function as an MCP tool.
        
        Args:
            func: The function to register as a tool
            
        Returns:
            The original function, unmodified
        """
        def decorator(f):
            # Get function metadata
            name = f.__name__
            docstring = f.__doc__ or ""
            signature = inspect.signature(f)
            type_hints = get_type_hints(f)
            
            # Extract parameter info
            parameters = []
            for param_name, param in signature.parameters.items():
                param_type = type_hints.get(param_name, Any).__name__
                has_default = param.default is not param.empty
                default_value = param.default if has_default else None
                
                parameters.append({
                    "name": param_name,
                    "type": param_type,
                    "required": not has_default,
                    "default": default_value
                })
            
            # Register the tool
            self.tools[name] = {
                "function": f,
                "name": name,
                "description": docstring,
                "parameters": parameters,
                "return_type": type_hints.get("return", Any).__name__
            }
            
            logger.info(f"Registered tool: {name}")
            return f
        
        # Handle both @tool and @tool()
        if func is None:
            return decorator
        return decorator(func)
    
    def get_tools_description(self) -> List[Dict[str, Any]]:
        """
        Get a description of all registered tools in a format suitable for LLMs.
        
        Returns:
            A list of tool descriptions
        """
        tools = []
        for name, tool in self.tools.items():
            tools.append({
                "name": name,
                "description": tool["description"],
                "parameters": tool["parameters"],
                "return_type": tool["return_type"]
            })
        return tools
    
    def call_tool(self, name: str, **kwargs) -> Any:
        """
        Call a registered tool by name with the provided arguments.
        
        Args:
            name: The name of the tool to call
            **kwargs: Arguments to pass to the tool
            
        Returns:
            The result of the tool execution
            
        Raises:
            ValueError: If the tool is not found
        """
        if name not in self.tools:
            raise ValueError(f"Tool not found: {name}")
        
        tool = self.tools[name]
        function = tool["function"]
        
        try:
            result = function(**kwargs)
            return result
        except Exception as e:
            logger.error(f"Error executing tool {name}: {e}")
            raise
    
    async def run(self, host: str = "0.0.0.0", port: int = 8765):
        """
        Start the MCP server as a blocking operation.
        
        Args:
            host: The host address to bind to
            port: The port to listen on
        """
        self.ws_server = await websockets.serve(
            self._handle_client, host, port
        )
        logger.info(f"FastMCP server '{self.name}' running on {host}:{port}")
        await self.ws_server.wait_closed()
    
    async def _handle_client(self, websocket, path):
        """
        Handle a client connection.
        
        Args:
            websocket: The WebSocket connection
            path: The connection path
        """
        client_id = id(websocket)
        self.clients.add(websocket)
        self.client_queues[client_id] = asyncio.Queue()
        
        logger.info(f"Client connected: {client_id}")
        
        try:
            # Handle incoming messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    logger.info(f"Received from client {client_id}: {data}")
                    
                    # Handle different message types
                    if data.get("type") == "get_tools":
                        # Send tool descriptions
                        response = {
                            "id": data.get("id"),
                            "type": "tools_response",
                            "tools": self.get_tools_description()
                        }
                        await websocket.send(json.dumps(response))
                    
                    elif data.get("type") == "mcp_command":
                        # Execute a tool
                        command = data.get("command")
                        params = data.get("params", {})
                        message_id = data.get("id")
                        
                        try:
                            # Call the tool and get the result
                            result = self.call_tool(command, **params)
                            
                            # Send the response
                            response = {
                                "id": message_id,
                                "type": "mcp_response",
                                "result": {
                                    "status": "success",
                                    "result": result,
                                    "timestamp": None  # Will be filled by main server
                                }
                            }
                            await websocket.send(json.dumps(response))
                        
                        except Exception as e:
                            # Send error response
                            response = {
                                "id": message_id,
                                "type": "mcp_response",
                                "result": {
                                    "status": "error",
                                    "error": str(e),
                                    "timestamp": None  # Will be filled by main server
                                }
                            }
                            await websocket.send(json.dumps(response))
                    
                    else:
                        logger.warning(f"Unknown message type: {data.get('type')}")
                        response = {
                            "id": data.get("id"),
                            "type": "error",
                            "error": "Unknown message type"
                        }
                        await websocket.send(json.dumps(response))
                
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON from client {client_id}: {message}")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "error": "Invalid JSON"
                    }))
        
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"Client disconnected: {client_id}")
        
        finally:
            # Clean up
            if websocket in self.clients:
                self.clients.remove(websocket)
            if client_id in self.client_queues:
                del self.client_queues[client_id] 