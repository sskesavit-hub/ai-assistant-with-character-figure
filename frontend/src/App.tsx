import React, { useState, useRef } from 'react';
import { ThreeViewport } from './components/ThreeViewport';
import { Live2DViewport } from './components/Live2DViewport';
import { ChatInterface } from './components/ChatInterface';
import type { ChatMessage } from './components/ChatInterface';
import { SettingsPanel } from './components/SettingsPanel';

export const App: React.FC = () => {
  // Config state
  const [config, setConfig] = useState({
    provider: 'ollama',
    model: '',
    apiUrl: 'http://localhost:11434',
    permissionMode: 'prompt', // safe, prompt, autonomy
    ttsProvider: 'edge', // edge, elevenlabs, xtts
    elevenLabsKey: '',
    elevenLabsVoiceId: '',
    selectedModelFile: '3d/huohuo_clean/huohuo.model3.json',
    selectedVoiceSample: '',
    jingliuOpenEye: false,
    miniZoom: 1.6,
    miniYOffset: 0,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Lip-Sync and Expression states
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [emotion, setEmotion] = useState<string>('neutral');

  // Vision state
  const [attachedImage, setAttachedImage] = useState<File | null>(null);

  // Pending agent approval state
  const [pendingTool, setPendingTool] = useState<{
    session_id: string;
    action: string;
    arguments: any;
  } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [models, setModels] = useState<string[]>([]);

  // Mini Mode State
  const [isMiniMode, setIsMiniMode] = useState(false);

  const toggleMiniMode = (enable: boolean) => {
    setIsMiniMode(enable);
    if ((window as any).electronAPI) {
      (window as any).electronAPI.setMiniMode(enable);
    }
  };

  const updateConfig = (newConfig: Partial<typeof config>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  // Auto-scan and select the first available character (preferring Live2D model if available) on startup
  React.useEffect(() => {
    const autoSelectModel = async (attempt = 0) => {
      try {
        const res = await fetch('http://localhost:8000/api/models');
        if (res.ok) {
          const data = await res.json();
          if (data.models && Array.isArray(data.models)) {
            const cleanModels = data.models.filter((m: any) => typeof m === 'string' && m);
            setModels(cleanModels);
            const live2dModel = cleanModels.find((m: string) => m.endsWith('.model3.json'));
            const defaultModel = live2dModel || cleanModels[0] || '3d/huohuo_clean/huohuo.model3.json';
            setConfig(prev => ({ ...prev, selectedModelFile: defaultModel }));
          }
        } else if (attempt < 10) {
          setTimeout(() => autoSelectModel(attempt + 1), 600);
        }
      } catch (err) {
        // Backend not ready yet — retry up to 10 times
        if (attempt < 10) {
          setTimeout(() => autoSelectModel(attempt + 1), 600);
        } else {
          console.error("Failed to auto-select model on startup:", err);
        }
      }
    };
    autoSelectModel();
  }, []);

  const handleAttachImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedImage(file);
    }
  };

  // Speaks response using the backend API
  const speakResponse = async (text: string) => {
    try {
      const formData = new FormData();
      formData.append('text', text);
      formData.append('tts_provider', config.ttsProvider);
      if (config.selectedVoiceSample) {
        formData.append('voice_sample_name', config.selectedVoiceSample);
      }
      if (config.elevenLabsKey) {
        formData.append('eleven_key', config.elevenLabsKey);
      }
      if (config.elevenLabsVoiceId) {
        formData.append('eleven_voice_id', config.elevenLabsVoiceId);
      }

      const res = await fetch('http://localhost:8000/api/tts', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        console.error("Failed to fetch speech audio");
        return;
      }

      // Read emotion header
      const responseEmotion = res.headers.get('X-Emotion') || 'neutral';
      setEmotion(responseEmotion);

      // Convert audio response to URL blob
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop previous audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setAudioElement(audio);
      audio.play().catch(err => {
        console.warn("Audio autoplay blocked by browser policy. User interaction required.", err);
      });
      
      // Reset emotion to neutral once speaking ends
      audio.onended = () => {
        setEmotion('neutral');
      };
    } catch (err) {
      console.error("Error synthesizing speech:", err);
    }
  };

  // Submits user prompt to backend agent loop
  const handleSendMessage = async () => {
    let prompt = inputValue.trim();
    if (!prompt && !attachedImage) return;

    setIsProcessing(true);
    setStatusText("Initiating local brain loop...");
    setInputValue('');

    // If there is an attached image, copy it to the workspace or send it (in a real system, we upload it)
    if (attachedImage) {
      setStatusText(`Uploading ${attachedImage.name} for vision analysis...`);
      const formData = new FormData();
      formData.append('file', attachedImage);
      try {
        const uploadRes = await fetch('http://localhost:8000/api/upload-voice', { // use upload-voice/upload-model path as generic storage in models
          method: 'POST',
          body: formData,
        });
        if (uploadRes.ok) {
          const data = await uploadRes.json();
          // Prepend image path to the prompt for the agent
          prompt = `[Vision Input: image file is saved in workspace under models/${data.filename}] ${prompt}`;
        }
      } catch (err) {
        console.error("Failed to upload vision image:", err);
      }
      setAttachedImage(null);
    }

    const newUserMsg: ChatMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, newUserMsg]);

    const chatHistory = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('http://localhost:8000/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          history: chatHistory,
          provider: config.provider,
          model: config.model,
          api_url: config.apiUrl,
          permission_mode: config.permissionMode,
        }),
      });

      if (!res.ok) {
        throw new Error("Local LLM request failed. Please check backend connection.");
      }

      const data = await res.json();
      handleAgentStepResponse(data);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Failed to execute: ${err.message || 'Make sure your local LLM engine (Ollama/LM Studio) is running and loaded.'}`
      }]);
      setIsProcessing(false);
    }
  };

  // Handles stepping response from backend (could be final response, or a pending tool approval)
  const handleAgentStepResponse = (data: any) => {

    if (data.status === 'pending_approval') {
      setStatusText(`Awaiting authorization for: ${data.tool}`);
      setPendingTool({
        session_id: data.session_id,
        action: data.tool,
        arguments: data.arguments,
      });
    } else if (data.status === 'done') {
      const text = data.response;
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      setIsProcessing(false);
      setPendingTool(null);
      speakResponse(text);
    }
  };

  // Resumes agent loop after approving/denying a pending tool call
  const handleApproveTool = async (approved: boolean) => {
    if (!pendingTool) return;
    
    setStatusText(approved ? "Executing authorized command..." : "Canceling command...");
    const currentSession = pendingTool.session_id;
    setPendingTool(null);

    try {
      const res = await fetch('http://localhost:8000/api/agent/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: currentSession,
          approved: approved,
          provider: config.provider,
          model: config.model,
          api_url: config.apiUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        handleAgentStepResponse(data);
      } else {
        throw new Error("Failed to submit authorization response.");
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ Permission Error: ${err.message}`
      }]);
      setIsProcessing(false);
    }
  };

  if (isMiniMode) {
    return (
      <div 
        style={{
          width: '100vw',
          height: '100vh',
          borderRadius: '50%',
          overflow: 'hidden',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          border: '4px solid rgba(59, 130, 246, 0.6)',
          boxShadow: '0 0 20px rgba(59,130,246,0.3) inset',
          boxSizing: 'border-box', // Ensure the 4px border doesn't overflow the OS window!
          position: 'relative',
          // The entire circle is no-drag by default to allow 3D rotation
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <div style={{ width: '100%', height: '100%' } as React.CSSProperties}>
          {config.selectedModelFile.endsWith('.model3.json') ? (
            <Live2DViewport 
              modelUrl={`http://localhost:8000/api/models/${config.selectedModelFile}`}
              audioElement={audioElement} 
              emotion={emotion}
              jingliuOpenEye={config.jingliuOpenEye}
              isMiniMode={true}
              miniZoom={config.miniZoom}
              miniYOffset={config.miniYOffset}
            />
          ) : (
            <ThreeViewport
              modelUrl={`http://localhost:8000/api/models/${config.selectedModelFile}`}
              audioElement={audioElement}
              emotion={emotion}
            />
          )}
        </div>

        {/* DRAG HANDLE */}
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '60px',
            height: '24px',
            background: 'rgba(59, 130, 246, 0.5)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            WebkitAppRegion: 'drag', // This specific handle drags the OS window
            zIndex: 10001,
          } as React.CSSProperties}
          title="Drag to move"
        >
          <span style={{ color: 'white', fontSize: '10px', letterSpacing: '2px' }}>•••</span>
        </div>

        {/* RESTORE BUTTON */}
        <button
          onClick={(e) => { e.stopPropagation(); toggleMiniMode(false); }}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            color: '#60a5fa',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            transition: 'all 0.2s',
            WebkitAppRegion: 'no-drag',
          } as React.CSSProperties}
          title="Restore full app"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div 
      className="app-container" 
      style={{ background: 'radial-gradient(circle at 50% 50%, #0c1024 0%, #030712 100%)', WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 3D Viewport on Left side */}
      <div className="left-panel" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Main Front Character Selector Menu */}
        <div 
          className="glass-panel" 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            marginBottom: '16px',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
          }}
        >
          <span 
            style={{
              color: '#94a3b8',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '0.9rem',
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}
          >
            ACTIVE CHARACTER:
          </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <select 
                value={config.selectedModelFile}
                onChange={(e) => updateConfig({ selectedModelFile: e.target.value })}
                style={{
                  background: 'rgba(31, 41, 55, 0.65)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#f3f4f6',
                  padding: '6px 12px',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer',
                  width: '260px',
                }}
              >
                {models.filter(m => typeof m === 'string' && m).map(m => {
                  let displayName = m;
                  if (m.endsWith('.model3.json')) {
                    const parts = m.split('/');
                    displayName = parts[parts.length - 2] || m;
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1) + " (Live2D)";
                  } else {
                    displayName = m.replace('.vrm', '').replace('.glb', '');
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1) + " (3D)";
                  }
                  return (
                    <option key={m} value={m}>
                      {displayName}
                    </option>
                  );
                })}
              </select>

              {config.selectedModelFile.includes('jingliu') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                  <input 
                    type="checkbox" 
                    id="jingliu-eyes"
                    checked={config.jingliuOpenEye} 
                    onChange={(e) => updateConfig({ jingliuOpenEye: e.target.checked })} 
                    style={{ accentColor: '#3b82f6', width: '14px', height: '14px', cursor: 'pointer' }}
                  />
                  <label htmlFor="jingliu-eyes" style={{ color: '#93c5fd', fontFamily: 'Outfit, sans-serif', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                    Remove Blindfold
                  </label>
                </div>
              )}
              
              <button
                onClick={() => toggleMiniMode(true)}
                style={{
                  background: 'rgba(59, 130, 246, 0.2)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  borderRadius: '6px',
                  color: '#93c5fd',
                  padding: '4px 12px',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                title="Mini Widget Mode"
              >
                <span>↙</span> Mini Mode
              </button>
            </div>
          </div>

        {config.selectedModelFile.endsWith('.model3.json') ? (
          <Live2DViewport 
            modelUrl={`http://localhost:8000/api/models/${config.selectedModelFile}`}
            audioElement={audioElement} 
            emotion={emotion}
            jingliuOpenEye={config.jingliuOpenEye}
          />
        ) : (
          <ThreeViewport
            modelUrl={`http://localhost:8000/api/models/${config.selectedModelFile}`}
            audioElement={audioElement}
            emotion={emotion}
          />
        )}
      </div>

      {/* Control Pane & Chat on Right side */}
      <div className="right-panel" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <ChatInterface
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={handleSendMessage}
          statusText={statusText}
          isProcessing={isProcessing}
          onOpenSettings={() => setShowSettings(true)}
          onAttachImage={handleAttachImage}
          attachedImageName={attachedImage ? attachedImage.name : null}
          pendingTool={pendingTool}
          onApproveTool={handleApproveTool}
        />
      </div>

      {/* Popup Settings modal */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          config={config}
          onConfigChange={updateConfig}
        />
      )}
    </div>
  );
};
export default App;
