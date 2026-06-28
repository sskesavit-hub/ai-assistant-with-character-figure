import os
import subprocess
import json
import requests
import base64
from typing import Dict, Any, List
from backend.search import google_search, scrape_page_content

class AgentExecutor:
    def __init__(self, workspace_root: str = "c:/PRO A1"):
        self.workspace_root = os.path.abspath(workspace_root)
        self.permission_mode = "prompt"  # "safe" (read-only/sandbox), "prompt", "autonomy"
        self.current_model = "llama3"
        self.current_provider = "ollama"  # "ollama" or "lm_studio"
        self.api_url = "http://localhost:11434" # default Ollama
        
        # Action log to store history of executed actions
        self.action_history = []

    def log_action(self, action: str, args: Any, status: str, result: str = ""):
        self.action_history.append({
            "action": action,
            "arguments": args,
            "status": status,
            "result": result[:500] + ("..." if len(result) > 500 else "")
        })

    def run_tool(self, action: str, args: Dict[str, Any]) -> str:
        """
        Execute a local system tool.
        """
        if action == "run_system_command":
            cmd = args.get("command")
            if not cmd:
                return "Error: No command provided."
            
            # Enforce "safe" mode sandbox constraints
            if self.permission_mode == "safe":
                # Check for modifying commands
                cmd_lower = cmd.lower()
                forbidden = ["rm", "del", "format", "mkfs", "rmdir", "destroy", "shutdown"]
                if any(f in cmd_lower for f in forbidden):
                    self.log_action(action, args, "blocked", "Command blocked due to Safe Mode constraints.")
                    return "Error: This command is blocked in Safe Mode. Switch to Prompt or Autonomy mode."

            try:
                # Run the command in workspace directory
                result = subprocess.run(
                    cmd, 
                    shell=True, 
                    cwd=self.workspace_root, 
                    capture_output=True, 
                    text=True, 
                    timeout=30
                )
                output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
                self.log_action(action, args, "success", output)
                return output
            except Exception as e:
                err_msg = f"Error executing command: {str(e)}"
                self.log_action(action, args, "failed", err_msg)
                return err_msg

        elif action == "read_file":
            rel_path = args.get("path")
            if not rel_path:
                return "Error: No path provided."
            abs_path = os.path.abspath(os.path.join(self.workspace_root, rel_path))
            # Ensure path is within workspace for safety
            if not abs_path.startswith(self.workspace_root):
                return "Error: Access denied. Cannot read files outside workspace root."
            
            try:
                if not os.path.exists(abs_path):
                    return f"Error: File '{rel_path}' does not exist."
                with open(abs_path, "r", encoding="utf-8") as f:
                    content = f.read()
                self.log_action(action, args, "success", f"Read {len(content)} bytes")
                return content
            except Exception as e:
                err = f"Error reading file: {str(e)}"
                self.log_action(action, args, "failed", err)
                return err

        elif action == "write_file":
            rel_path = args.get("path")
            content = args.get("content", "")
            if not rel_path:
                return "Error: No path provided."
            abs_path = os.path.abspath(os.path.join(self.workspace_root, rel_path))
            if not abs_path.startswith(self.workspace_root):
                return "Error: Access denied. Cannot write files outside workspace root."
                
            if self.permission_mode == "safe":
                self.log_action(action, args, "blocked", "Write blocked in Safe Mode.")
                return "Error: File writing is disabled in Safe Mode."

            try:
                os.makedirs(os.path.dirname(abs_path), exist_ok=True)
                with open(abs_path, "w", encoding="utf-8") as f:
                    f.write(content)
                self.log_action(action, args, "success", f"Wrote {len(content)} characters")
                return f"Successfully wrote file to '{rel_path}'."
            except Exception as e:
                err = f"Error writing file: {str(e)}"
                self.log_action(action, args, "failed", err)
                return err

        elif action == "list_directory":
            rel_path = args.get("path", ".")
            abs_path = os.path.abspath(os.path.join(self.workspace_root, rel_path))
            if not abs_path.startswith(self.workspace_root):
                return "Error: Access denied. Cannot list directory outside workspace root."
            try:
                if not os.path.exists(abs_path):
                    return f"Error: Directory '{rel_path}' does not exist."
                files = os.listdir(abs_path)
                result_str = "\n".join([f"[{'DIR' if os.path.isdir(os.path.join(abs_path, f)) else 'FILE'}] {f}" for f in files])
                self.log_action(action, args, "success", result_str)
                return result_str or "Directory is empty."
            except Exception as e:
                err = f"Error listing directory: {str(e)}"
                self.log_action(action, args, "failed", err)
                return err

        elif action == "google_search":
            query = args.get("query")
            if not query:
                return "Error: No query provided."
            results = google_search(query)
            # Format results nicely for LLM context
            res_str = ""
            for idx, r in enumerate(results):
                res_str += f"{idx+1}. {r.get('title')}\nURL: {r.get('link')}\nSnippet: {r.get('snippet')}\n\n"
            self.log_action(action, args, "success", res_str)
            return res_str

        elif action == "web_scrape":
            url = args.get("url")
            if not url:
                return "Error: No URL provided."
            content = scrape_page_content(url)
            self.log_action(action, args, "success", f"Scraped {len(content)} characters")
            return content

        elif action == "vision_analyze":
            image_path = args.get("image_path")
            prompt = args.get("prompt", "Describe this image.")
            if not image_path:
                return "Error: No image path provided."
            
            abs_img_path = os.path.abspath(os.path.join(self.workspace_root, image_path))
            if not os.path.exists(abs_img_path):
                # Fallback to absolute system path if workspace path doesn't exist
                abs_img_path = os.path.abspath(image_path)
                if not os.path.exists(abs_img_path):
                    return f"Error: Image file not found at '{image_path}'."

            return self._run_vision_model(abs_img_path, prompt)

        else:
            return f"Error: Unknown tool action '{action}'."

    def _run_vision_model(self, image_path: str, prompt: str) -> str:
        """
        Calls local vision LLM (e.g. llava in Ollama) to analyze the image.
        """
        try:
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                
            if self.current_provider == "ollama":
                url = f"{self.api_url}/api/generate"
                payload = {
                    "model": "llava",  # Default local vision model
                    "prompt": prompt,
                    "images": [encoded_string],
                    "stream": False
                }
                response = requests.post(url, json=payload, timeout=60)
                if response.status_code == 200:
                    return response.json().get("response", "No vision description returned.")
                else:
                    return f"Vision API error (Ollama): {response.text}"
            else:
                # LM Studio endpoint
                url = f"{self.api_url}/v1/chat/completions"
                payload = {
                    "model": self.current_model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{encoded_string}"
                                    }
                                }
                            ]
                        }
                    ],
                    "stream": False
                }
                response = requests.post(url, json=payload, timeout=60)
                if response.status_code == 200:
                    return response.json()["choices"][0]["message"]["content"]
                else:
                    return f"Vision API error (LM Studio): {response.text}"
        except Exception as e:
            return f"Error performing vision analysis: {str(e)}"

    def get_system_prompt(self) -> str:
        return """You are a friendly, helpful local AI virtual assistant.
        
Your goal is to have a fast, natural, and helpful conversation with the user. Just answer the user's messages directly in conversational text. Do not output tool calls, JSON structures, or system commands.

Emotion Expression:
You can prepend emotion tags like [HAPPY], [SAD], [ANGRY], [RELAXED], or [SURPRISED] at the very beginning of your response to express your feelings and animate your avatar's expressions.
Example: "[HAPPY] Hello there! How can I help you today?"
"""
