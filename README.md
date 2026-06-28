# 3D AI Desktop Assistant

An intelligent, interactive desktop AI companion featuring Live2D & 3D avatars, voice recognition, text-to-speech, and deep operating system integration. This assistant runs locally on your machine and can interact with your computer!

## 🌟 Features

- **Live2D & 3D Avatars**: Chat with responsive, animated characters.
- **Mini Widget Mode**: Turn the app into a frameless, transparent circle widget that hovers on your desktop.
- **Local AI Brain**: Powered by Ollama for fully local, private AI conversations.
- **Voice Synthesis (TTS)**: Includes Edge-TTS and ElevenLabs support for expressive, realistic voices.
- **Computer Vision**: Attach images to the chat and the AI can "see" and analyze them.
- **Autonomous Agent**: The AI can write files, run terminal commands, and perform tasks on your computer (with Safe Mode sandbox or Full Autonomy).
- **Settings Manager**: Customize your AI provider, voice cloning, API keys, and widget calibration on the fly.

## 🚀 Tech Stack

- **Frontend**: React, TypeScript, Vite, PixiJS (Live2D), Three.js (3D GLB/VRM)
- **Backend**: Python, FastAPI, LangChain, Ollama
- **Desktop Wrapper**: Electron

## 🛠️ Installation & Setup

1. **Prerequisites**:
   - Install [Node.js](https://nodejs.org/) (v18+ recommended)
   - Install [Python](https://www.python.org/) (3.10+ recommended)
   - Install [Ollama](https://ollama.com/) (For local AI models)

2. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd 3D-AI-Assistant
   ```

3. **Run the Application**:
   Simply run the automated startup script on Windows:
   ```cmd
   run.bat
   ```
   *(This script automatically installs all Node/Python dependencies, builds the frontend, starts the FastAPI backend server, and launches the Electron desktop app).*

## ⚙️ Configuration

Open the **Settings Panel (⚙️)** in the app to configure:
- **Local Brain (LLM)**: Switch AI providers (Ollama, OpenAI, Groq, etc) and set API keys.
- **Voice Settings**: Change Text-to-Speech engines and upload voice samples for cloning.
- **3D Assistant Model**: Upload your own `.vrm`, `.glb`, or `.model3.json` files and calibrate the Mini Mode zoom & position.
- **Security Permissions**: Restrict the AI to a safe sandbox, require prompts for actions, or grant full system autonomy.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.
