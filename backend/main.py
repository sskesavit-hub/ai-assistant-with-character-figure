import os
import json
import re
import asyncio
import httpx
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from backend.tts import TTSEngine
from backend.agent import AgentExecutor
from backend.search import google_search

app = FastAPI(title="AI 3D Assistant Backend")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Emotion"]
)

# Global instances
tts_engine = TTSEngine()
agent_executor = AgentExecutor()

# Session storage for agent states (enabling step-by-step approval from frontend)
# Format: { session_id: { "history": [...], "pending_tool": { "action": ..., "args": ... } } }
agent_sessions: Dict[str, Dict[str, Any]] = {}

class LogItem(BaseModel):
    type: str
    message: str

@app.post("/api/logs")
async def log_message(item: LogItem):
    print(f"[FRONTEND {item.type.upper()}] {item.message}")
    try:
        # Write to workspace file
        with open("frontend_debug.log", "a", encoding="utf-8") as f:
            f.write(f"[{item.type.upper()}] {item.message}\n")
    except Exception:
        pass
    return {"status": "ok"}


class ChatRequest(BaseModel):
    prompt: str
    history: List[Dict[str, str]]
    provider: str  # "ollama" or "lm_studio"
    model: str
    api_url: str
    permission_mode: str  # "safe", "prompt", "autonomy"

class ApproveRequest(BaseModel):
    session_id: str
    approved: bool
    provider: str
    model: str
    api_url: str

# Endpoints

@app.get("/api/settings/scan")
async def scan_endpoints():
    """
    Scan local loopback ports for running LLM servers (Ollama, LM Studio, KoboldCPP).
    """
    targets = {
        "ollama": "http://localhost:11434",
        "lm_studio": "http://localhost:1234",
        "kobold": "http://localhost:5001"
    }
    
    results = {}
    
    async with httpx.AsyncClient() as client:
        # Scan Ollama
        try:
            res = await client.get(f"{targets['ollama']}/api/tags", timeout=1.0)
            if res.status_code == 200:
                models = [m["name"] for m in res.json().get("models", [])]
                results["ollama"] = {"url": targets["ollama"], "models": models, "active": True}
        except Exception:
            results["ollama"] = {"url": targets["ollama"], "models": [], "active": False}
            
        # Scan LM Studio
        try:
            res = await client.get(f"{targets['lm_studio']}/v1/models", timeout=1.0)
            if res.status_code == 200:
                models = [m["id"] for m in res.json().get("data", [])]
                results["lm_studio"] = {"url": targets["lm_studio"], "models": models, "active": True}
        except Exception:
            results["lm_studio"] = {"url": targets["lm_studio"], "models": [], "active": False}

        # Scan Kobold
        try:
            res = await client.get(f"{targets['kobold']}/api/v1/model", timeout=1.0)
            if res.status_code == 200:
                results["kobold"] = {"url": targets["kobold"], "models": [res.json().get("result", "kobold-model")], "active": True}
        except Exception:
            results["kobold"] = {"url": targets["kobold"], "models": [], "active": False}

    return results

@app.post("/api/tts")
async def text_to_speech(
    text: str = Form(...),
    tts_provider: str = Form(...), # "edge", "elevenlabs", "xtts"
    voice_sample_name: Optional[str] = Form(None),
    eleven_key: Optional[str] = Form(None),
    eleven_voice_id: Optional[str] = Form(None)
):
    """
    Synthesize speech, stripping and identifying sentiment emotions.
    """
    # Detect emotion tag in text
    emotion = "neutral"
    match = re.search(r'\[([A-Z_]+)\]', text.upper())
    if match:
        emotion_tag = match.group(1).lower()
        # Map to valid 3D and 2D expressions
        if emotion_tag in ["happy", "sad", "angry", "surprised", "relaxed", "shy", "blush", "scared", "shocked", "tired", "excited"]:
            emotion = emotion_tag

    filepath = ""
    try:
        if tts_provider == "edge":
            filepath = await tts_engine.speak_edge(text)
        elif tts_provider == "elevenlabs":
            if not eleven_key:
                raise HTTPException(400, "ElevenLabs API Key required")
            
            voice_ref = eleven_voice_id
            if voice_sample_name:
                voice_ref = os.path.join("models", voice_sample_name)
            
            if not voice_ref:
                raise HTTPException(400, "Voice ID or Sample WAV required for ElevenLabs voice cloning")
                
            filepath = tts_engine.speak_elevenlabs(text, eleven_key, voice_ref)
        elif tts_provider == "xtts":
            if not voice_sample_name:
                raise HTTPException(400, "Voice sample WAV required for local XTTS voice cloning")
            sample_wav = os.path.join("models", voice_sample_name)
            if not os.path.exists(sample_wav):
                raise HTTPException(404, f"Voice sample not found at '{sample_wav}'")
            filepath = tts_engine.speak_local_xtts(text, sample_wav)
        elif tts_provider == "gpt-sovits":
            if not voice_sample_name:
                raise HTTPException(400, "Voice sample WAV required for GPT-SoVITS voice cloning")
            sample_wav = os.path.join("models", voice_sample_name)
            if not os.path.exists(sample_wav):
                raise HTTPException(404, f"Voice sample not found at '{sample_wav}'")
            filepath = await tts_engine.speak_gpt_sovits(
                text=text,
                ref_audio_path=sample_wav,
                prompt_text="Default voice style text",
                prompt_lang="en",
                text_lang="en"
            )
        else:
            raise HTTPException(400, f"Unsupported TTS provider: {tts_provider}")

        if not filepath or not os.path.exists(filepath):
            raise HTTPException(500, "Failed to generate speech audio file")

        # Return audio file with custom header telling the frontend which face expression to set
        headers = {"X-Emotion": emotion}
        return FileResponse(filepath, media_type="audio/mpeg", headers=headers)
        
    except Exception as e:
        raise HTTPException(500, f"TTS Synthesis error: {str(e)}")

@app.post("/api/upload-voice")
async def upload_voice(file: UploadFile = File(...)):
    """
    Upload a sample audio file (.wav) to use for voice cloning.
    """
    if not file.filename.endswith((".wav", ".mp3")):
        raise HTTPException(400, "Only WAV and MP3 audio files supported for voice cloning")
    
    os.makedirs("models", exist_ok=True)
    filepath = os.path.join("models", file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())
    return {"message": f"Successfully uploaded voice sample: {file.filename}", "filename": file.filename}

@app.post("/api/upload-model")
async def upload_model(file: UploadFile = File(...)):
    """
    Upload a custom 3D VRM or GLB model.
    """
    if not file.filename.endswith((".vrm", ".glb")):
        raise HTTPException(400, "Only VRM and GLB models are supported")
    
    os.makedirs("models", exist_ok=True)
    filepath = os.path.join("models", file.filename)
    with open(filepath, "wb") as f:
        f.write(await file.read())
    return {"message": f"Successfully uploaded model: {file.filename}", "filename": file.filename}

@app.get("/api/models")
async def list_models():
    """
    Scan both 'models/' and '3d/' directories recursively for .vrm and .glb character files.
    """
    models_list = []
    
    # Scan models/
    models_dir = "models"
    if os.path.exists(models_dir):
        for root, _, files in os.walk(models_dir):
            for file in files:
                if file.endswith((".vrm", ".glb", ".model3.json")):
                    rel_path = os.path.relpath(os.path.join(root, file), models_dir)
                    models_list.append(rel_path.replace("\\", "/"))
                    
    # Scan 3d/
    dir_3d = "3d"
    if os.path.exists(dir_3d):
        for root, _, files in os.walk(dir_3d):
            for file in files:
                if file.endswith((".vrm", ".glb", ".model3.json")):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, os.path.dirname(dir_3d))
                    models_list.append(rel_path.replace("\\", "/"))
                    
    # Ensure there's a fallback if empty
    if not models_list:
        models_list = ["3d/hoshino/hoshino.model3.json"]
        
    return {"models": models_list}

@app.get("/api/models/{filepath:path}")
async def get_model(filepath: str):
    """
    Serve model files from either 'models/' or '3d/' directories.
    Paths are always resolved relative to the workspace root (parent of this file).
    """
    # Always resolve relative to the workspace root, regardless of CWD
    workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    if filepath.startswith("3d/"):
        target_path = os.path.normpath(os.path.join(workspace_root, filepath))
    else:
        target_path = os.path.normpath(os.path.join(workspace_root, "models", filepath))

    # Prevent directory traversal
    if not target_path.startswith(workspace_root):
        raise HTTPException(403, "Access denied")

    if not os.path.exists(target_path):
        raise HTTPException(404, f"Model file not found: {filepath} (resolved to {target_path})")

    # Set correct MIME types for Live2D SDK file types
    ext = os.path.splitext(target_path)[1].lower()
    media_type_map = {
        ".json":  "application/json",
        ".moc3":  "application/octet-stream",
        ".png":   "image/png",
        ".jpg":   "image/jpeg",
        ".jpeg":  "image/jpeg",
        ".wav":   "audio/wav",
        ".mp3":   "audio/mpeg",
        ".ogg":   "audio/ogg",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    return FileResponse(target_path, media_type=media_type)


# Agent loop endpoint

@app.post("/api/agent/run")
async def run_agent_loop(req: ChatRequest):
    """
    Execute the agent loop.
    1. Send user prompt + history + tools instructions to the local LLM.
    2. Get JSON response from LLM.
    3. If 'final_response', return response.
    4. If tool call:
       - If permission_mode is 'autonomy', execute immediately, feed result back, and loop.
       - If permission_mode is 'prompt', return the pending tool to the UI for user approval.
       - If permission_mode is 'safe', block if dangerous, else proceed.
    """
    # Configure agent executor
    agent_executor.permission_mode = req.permission_mode
    agent_executor.current_model = req.model
    agent_executor.current_provider = req.provider
    agent_executor.api_url = req.api_url

    session_id = f"sess_{uuid_hex()}"
    
    # Initialize history for local LLM
    system_prompt = agent_executor.get_system_prompt()
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": req.prompt})

    # Run agent loop iteration
    return await step_agent(session_id, messages)

async def step_agent(session_id: str, messages: List[Dict[str, str]]):
    """
    Runs a single step of the LLM thought process.
    """
    try:
        llm_response = await call_local_llm(
            provider=agent_executor.current_provider,
            url=agent_executor.api_url,
            model=agent_executor.current_model,
            messages=messages
        )
        
        # Parse JSON from LLM output
        try:
            # Strip markdown block formatting if present
            cleaned_resp = llm_response.strip()
            if cleaned_resp.startswith("```json"):
                cleaned_resp = cleaned_resp[7:]
            if cleaned_resp.endswith("```"):
                cleaned_resp = cleaned_resp[:-3]
            cleaned_resp = cleaned_resp.strip()
            
            parsed = json.loads(cleaned_resp)
        except Exception:
            # Fallback if the LLM outputted free text instead of JSON
            parsed = {
                "thought": "LLM returned non-JSON text. Treating as final response.",
                "action": "final_response",
                "arguments": {"response": llm_response}
            }

        action = parsed.get("action", "final_response")
        arguments = parsed.get("arguments", {})
        thought = parsed.get("thought", "")

        # Save state in session
        agent_sessions[session_id] = {
            "messages": messages,
            "current_thought": thought,
            "pending_tool": None
        }

        if action == "final_response":
            response_text = arguments.get("response", "")
            return {
                "session_id": session_id,
                "status": "done",
                "thought": thought,
                "response": response_text,
                "actions": agent_executor.action_history
            }

        # If it is a tool call:
        # Check permissions
        if agent_executor.permission_mode == "prompt":
            # Suspend execution and ask frontend for approval
            agent_sessions[session_id]["pending_tool"] = {"action": action, "arguments": arguments}
            return {
                "session_id": session_id,
                "status": "pending_approval",
                "thought": thought,
                "tool": action,
                "arguments": arguments,
                "actions": agent_executor.action_history
            }
        
        # For autonomy or safe mode
        result = agent_executor.run_tool(action, arguments)
        
        # Feed the tool observation back to messages and iterate
        messages.append({"role": "assistant", "content": json.dumps(parsed)})
        messages.append({"role": "user", "content": f"Observation from {action}:\n{result}"})
        
        # Recurse (run the next step of the agent loop)
        return await step_agent(session_id, messages)

    except Exception as e:
        return {
            "session_id": session_id,
            "status": "done",
            "thought": "Execution failed due to server error.",
            "response": f"An error occurred in the agent loop: {str(e)}",
            "actions": agent_executor.action_history
        }

@app.post("/api/agent/approve")
async def approve_agent_tool(req: ApproveRequest):
    """
    Resume agent loop execution after user reviews and approves/rejects a pending tool call.
    """
    session = agent_sessions.get(req.session_id)
    if not session or not session.get("pending_tool"):
        raise HTTPException(404, "Session or pending tool execution not found.")
    
    agent_executor.permission_mode = "prompt"
    agent_executor.current_model = req.model
    agent_executor.current_provider = req.provider
    agent_executor.api_url = req.api_url
    
    messages = session["messages"]
    pending = session["pending_tool"]
    action = pending["action"]
    arguments = pending["arguments"]
    thought = session["current_thought"]

    # Clear pending tool
    session["pending_tool"] = None

    if not req.approved:
        # User rejected the command
        result = "Error: User rejected the execution of this action."
        agent_executor.log_action(action, arguments, "rejected", result)
    else:
        # User approved, run it
        result = agent_executor.run_tool(action, arguments)

    # Feed observation back to conversation history
    assistant_msg = json.dumps({"thought": thought, "action": action, "arguments": arguments})
    messages.append({"role": "assistant", "content": assistant_msg})
    messages.append({"role": "user", "content": f"Observation from {action}:\n{result}"})

    # Continue stepping the loop
    return await step_agent(req.session_id, messages)

async def call_local_llm(provider: str, url: str, model: str, messages: List[Dict[str, str]]) -> str:
    """
    Direct HTTP request to Ollama or LM Studio OpenAI endpoint.
    """
    async with httpx.AsyncClient() as client:
        if provider == "ollama":
            # Ollama /api/chat endpoint
            payload = {
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": 0.2  # Low temperature for tool reliability
                }
            }
            res = await client.post(f"{url}/api/chat", json=payload, timeout=90.0)
            if res.status_code == 200:
                return res.json().get("message", {}).get("content", "")
            else:
                raise Exception(f"Ollama returned status {res.status_code}: {res.text}")
        else:
            # LM Studio /v1/chat/completions endpoint
            payload = {
                "model": model,
                "messages": messages,
                "temperature": 0.2,
                "stream": False
            }
            res = await client.post(f"{url}/v1/chat/completions", json=payload, timeout=90.0)
            if res.status_code == 200:
                return res.json()["choices"][0]["message"]["content"]
            else:
                raise Exception(f"LM Studio returned status {res.status_code}: {res.text}")

def uuid_hex() -> str:
    import uuid
    return uuid.uuid4().hex

def cleanup_temp_dir():
    """Cleanup old TTS files on start."""
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "temp_audio")
    if os.path.exists(temp_dir):
        for f in os.listdir(temp_dir):
            try:
                os.remove(os.path.join(temp_dir, f))
            except Exception:
                pass

cleanup_temp_dir()
