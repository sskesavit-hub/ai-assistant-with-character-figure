const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let pythonProcess = null;

function startPythonBackend() {
  console.log("[Electron] Spawning Python sidecar backend...");
  
  // Resolve path to python virtualenv executable
  let pythonExecutable = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
  
  if (process.platform !== 'win32') {
    pythonExecutable = path.join(__dirname, '..', '.venv', 'bin', 'python');
  }

  // Uvicorn target file is backend/main.py
  // Command: .venv/Scripts/python -m uvicorn backend.main:app --port 8000
  pythonProcess = spawn(
    pythonExecutable,
    ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', '8000'],
    {
      cwd: path.join(__dirname, '..'),
      shell: false
    }
  );

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[FastAPI Output]: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[FastAPI Error]: ${data}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Electron] Python backend process exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "AI 3D Assistant",
    transparent: true,
    frame: false,
    hasShadow: false,
    icon: path.join(__dirname, 'icon.png'), // fallback icon placeholder
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Handle IPC for Mini Mode
  ipcMain.on('set-mini-mode', (event, isMini) => {
    if (!mainWindow) return;
    if (isMini) {
      mainWindow.setSize(280, 280);
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    } else {
      mainWindow.setSize(1280, 800);
      mainWindow.setAlwaysOnTop(false);
      mainWindow.center();
    }
  });

  // Load local React dev server
  mainWindow.loadURL('http://127.0.0.1:5173');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Poll until the FastAPI backend is ready before loading the window
async function waitForBackend(maxWaitMs = 15000, intervalMs = 300) {
  const http = require('http');
  const start = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const req = http.request({ hostname: '127.0.0.1', port: 8000, path: '/api/models', timeout: 200 }, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start < maxWaitMs) {
          setTimeout(check, intervalMs);
        } else {
          console.warn('[Electron] Backend did not start within timeout. Loading anyway.');
          resolve(false);
        }
      });
      req.end();
    };
    setTimeout(check, 300); // initial wait
  });
}

// Start sidecar and create window
app.whenReady().then(async () => {
  startPythonBackend();
  // Wait for backend to be ready before loading the UI
  console.log('[Electron] Waiting for FastAPI backend to start...');
  await waitForBackend();
  console.log('[Electron] Backend ready. Loading window...');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Terminate Sidecar python server cleanly on exit to prevent orphan background ports
app.on('window-all-closed', () => {
  console.log("[Electron] Window closed. Terminating FastAPI sidecar...");
  
  if (pythonProcess) {
    if (process.platform === 'win32') {
      // Force terminate python process tree to release ports immediately on Windows
      spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
    } else {
      pythonProcess.kill('SIGINT');
    }
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});
