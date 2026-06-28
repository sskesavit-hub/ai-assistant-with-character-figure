import React, { useState, useEffect } from 'react';
import { Settings, Shield, Volume2, Cpu, Upload, RefreshCw } from 'lucide-react';

interface SettingsPanelProps {
  onClose: () => void;
  config: {
    provider: string;
    model: string;
    apiUrl: string;
    permissionMode: string;
    ttsProvider: string;
    elevenLabsKey: string;
    elevenLabsVoiceId: string;
    selectedModelFile: string;
    selectedVoiceSample: string;
    miniZoom?: number;
    miniYOffset?: number;
  };
  onConfigChange: (newConfig: any) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  config,
  onConfigChange,
}) => {
  const [activeTab, setActiveTab] = useState<'llm' | 'tts' | 'model' | 'security'>('llm');
  
  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<any>(null);
  
  // File upload states
  const [uploadingModel, setUploadingModel] = useState(false);
  const [uploadingVoice, setUploadingVoice] = useState(false);
  const [uploadedModels, setUploadedModels] = useState<string[]>(['2_F.vrm']);
  const [uploadedVoices, setUploadedVoices] = useState<string[]>([]);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Scan for local LLM engines
  const scanLocalLLMs = async () => {
    setIsScanning(true);
    setUploadStatus("Scanning local LLMs...");
    try {
      const res = await fetch('http://localhost:8000/api/settings/scan');
      if (res.ok) {
        const data = await res.json();
        setScanResults(data);
        
        // Auto select first active provider if none is active
        const activeProvider = Object.keys(data).find(key => data[key].active);
        if (activeProvider) {
          onConfigChange({
            provider: activeProvider,
            apiUrl: data[activeProvider].url,
            model: data[activeProvider].models[0] || '',
          });
        }
        setUploadStatus("Scan complete.");
      } else {
        setUploadStatus("Scan failed.");
      }
    } catch (err) {
      setUploadStatus("Could not reach local backend. Is main.py running?");
    } finally {
      setIsScanning(false);
    }
  };

  const loadModelList = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/models');
      if (res.ok) {
        const data = await res.json();
        if (data.models && data.models.length > 0) {
          setUploadedModels(data.models);
        }
      }
    } catch (err) {
      console.error("Failed to load models list:", err);
    }
  };

  useEffect(() => {
    scanLocalLLMs();
    loadModelList();
  }, []);

  const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingModel(true);
    setUploadStatus("Uploading 3D model...");
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/upload-model', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setUploadedModels(prev => [...prev, data.filename]);
        onConfigChange({ selectedModelFile: data.filename });
        setUploadStatus("Model uploaded successfully!");
      } else {
        const err = await res.json();
        setUploadStatus(`Upload failed: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setUploadStatus("Upload failed. Connection error.");
    } finally {
      setUploadingModel(false);
    }
  };

  const handleVoiceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingVoice(true);
    setUploadStatus("Uploading voice sample...");
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('http://localhost:8000/api/upload-voice', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setUploadedVoices(prev => [...prev, data.filename]);
        onConfigChange({ selectedVoiceSample: data.filename });
        setUploadStatus("Voice sample uploaded successfully!");
      } else {
        const err = await res.json();
        setUploadStatus(`Upload failed: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      setUploadStatus("Upload failed. Connection error.");
    } finally {
      setUploadingVoice(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div className="glass-panel" style={styles.modal}>
        <div style={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Settings size={20} style={{ color: '#6366f1' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Settings Manager</span>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div style={styles.content}>
          {/* Tabs */}
          <div style={styles.tabs}>
            <button
              style={{ ...styles.tabBtn, borderLeftColor: activeTab === 'llm' ? '#6366f1' : 'transparent' }}
              onClick={() => setActiveTab('llm')}
            >
              <Cpu size={16} /> Local Brain (LLM)
            </button>
            <button
              style={{ ...styles.tabBtn, borderLeftColor: activeTab === 'tts' ? '#6366f1' : 'transparent' }}
              onClick={() => setActiveTab('tts')}
            >
              <Volume2 size={16} /> Voice Settings (TTS)
            </button>
            <button
              style={{ ...styles.tabBtn, borderLeftColor: activeTab === 'model' ? '#6366f1' : 'transparent' }}
              onClick={() => setActiveTab('model')}
            >
              <Upload size={16} /> 3D Assistant Model
            </button>
            <button
              style={{ ...styles.tabBtn, borderLeftColor: activeTab === 'security' ? '#6366f1' : 'transparent' }}
              onClick={() => setActiveTab('security')}
            >
              <Shield size={16} /> Agent Execution Mode
            </button>
          </div>

          {/* Panel Views */}
          <div style={styles.pane}>
            {uploadStatus && (
              <div style={styles.statusBar}>{uploadStatus}</div>
            )}

            {activeTab === 'llm' && (
              <div style={styles.paneContent}>
                <div style={styles.paneHeader}>
                  <span style={styles.paneTitle}>Configure Local Brain</span>
                  <button className="glass-btn-secondary" style={styles.scanBtn} onClick={scanLocalLLMs} disabled={isScanning}>
                    <RefreshCw size={14} className={isScanning ? 'pulse-glow' : ''} /> Scan Ports
                  </button>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Provider Service</label>
                  <select
                    className="glass-input"
                    value={config.provider}
                    onChange={(e) => {
                      const prov = e.target.value;
                      const url = scanResults?.[prov]?.url || '';
                      const models = scanResults?.[prov]?.models || [];
                      onConfigChange({ provider: prov, apiUrl: url, model: models[0] || '' });
                    }}
                  >
                    <option value="ollama">Ollama (Port 11434)</option>
                    <option value="lm_studio">LM Studio (Port 1234)</option>
                    <option value="kobold">KoboldCPP (Port 5001)</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Local LLM Model</label>
                  <select
                    className="glass-input"
                    value={config.model}
                    onChange={(e) => onConfigChange({ model: e.target.value })}
                  >
                    {scanResults?.[config.provider]?.models?.length > 0 ? (
                      scanResults[config.provider].models.map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                      ))
                    ) : (
                      <option value="">-- No loaded models found --</option>
                    )}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Custom API Endpoint Endpoint</label>
                  <input
                    type="text"
                    className="glass-input"
                    value={config.apiUrl}
                    onChange={(e) => onConfigChange({ apiUrl: e.target.value })}
                    placeholder="http://localhost:11434"
                  />
                </div>
              </div>
            )}

            {activeTab === 'tts' && (
              <div style={styles.paneContent}>
                <span style={styles.paneTitle}>Configure Speech Synthesizer</span>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Speech Engine</label>
                  <select
                    className="glass-input"
                    value={config.ttsProvider}
                    onChange={(e) => onConfigChange({ ttsProvider: e.target.value })}
                  >
                    <option value="edge">Edge-TTS (Free, High quality, Offline, Fast)</option>
                    <option value="elevenlabs">ElevenLabs API (Premium Voice Cloning)</option>
                    <option value="xtts">Local XTTS v2 (Offline Voice Cloning - Requires GPU)</option>
                    <option value="gpt-sovits">GPT-SoVITS (Local API on Port 9880)</option>
                  </select>
                </div>

                {config.ttsProvider === 'elevenlabs' && (
                  <>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>ElevenLabs API Key</label>
                      <input
                        type="password"
                        className="glass-input"
                        value={config.elevenLabsKey}
                        onChange={(e) => onConfigChange({ elevenLabsKey: e.target.value })}
                        placeholder="Enter ElevenLabs API Key"
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>ElevenLabs Voice ID (or clone from uploaded sample below)</label>
                      <input
                        type="text"
                        className="glass-input"
                        value={config.elevenLabsVoiceId}
                        onChange={(e) => onConfigChange({ elevenLabsVoiceId: e.target.value })}
                        placeholder="Voice ID"
                      />
                    </div>
                  </>
                )}

                {(config.ttsProvider === 'xtts' || config.ttsProvider === 'elevenlabs' || config.ttsProvider === 'gpt-sovits') && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Target Speaker WAV Sample</label>
                    <select
                      className="glass-input"
                      value={config.selectedVoiceSample}
                      onChange={(e) => onConfigChange({ selectedVoiceSample: e.target.value })}
                    >
                      <option value="">-- Upload a speaker sample below --</option>
                      {uploadedVoices.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>

                    <div style={{ marginTop: '10px' }}>
                      <label htmlFor="voice-file" style={styles.uploadBtn}>
                        <Upload size={14} /> Upload Speaker Sample (.wav/.mp3)
                      </label>
                      <input
                        id="voice-file"
                        type="file"
                        accept=".wav,.mp3"
                        style={{ display: 'none' }}
                        onChange={handleVoiceUpload}
                        disabled={uploadingVoice}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'model' && (
              <div style={styles.paneContent}>
                <span style={styles.paneTitle}>Configure 3D Assistant Model</span>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Active 3D Avatar (VRM/GLB)</label>
                  <select
                    className="glass-input"
                    value={config.selectedModelFile}
                    onChange={(e) => onConfigChange({ selectedModelFile: e.target.value })}
                  >
                    {uploadedModels.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>Import Custom 3D Model</label>
                  <label htmlFor="model-file" style={styles.uploadBtn}>
                    <Upload size={14} /> Upload Avatar file (.vrm/.glb)
                  </label>
                  <input
                    id="model-file"
                    type="file"
                    accept=".vrm,.glb"
                    style={{ display: 'none' }}
                    onChange={handleModelUpload}
                    disabled={uploadingModel}
                  />
                </div>

                <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: '15px' }}>
                    Mini Widget Calibration
                  </span>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Camera Zoom ({config.miniZoom?.toFixed(1) || '1.6'}x)
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>Adjust if the character is too small or too large in the circle.</span>
                    </label>
                    <input 
                      type="range" 
                      min="0.1" max="10.0" step="0.1" 
                      value={config.miniZoom ?? 1.6} 
                      onChange={(e) => onConfigChange({ miniZoom: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: '#6366f1' }}
                    />
                  </div>
                  
                  <div style={styles.formGroup}>
                    <label style={styles.label}>
                      Vertical Position Offset ({config.miniYOffset || 0}px)
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>Adjust if the character's face is cut off at the top or bottom.</span>
                    </label>
                    <input 
                      type="range" 
                      min="-1500" max="1500" step="10" 
                      value={config.miniYOffset ?? 0} 
                      onChange={(e) => onConfigChange({ miniYOffset: parseInt(e.target.value) })}
                      style={{ width: '100%', accentColor: '#6366f1' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div style={styles.paneContent}>
                <span style={styles.paneTitle}>Agent Security Permissions</span>
                <p style={styles.description}>
                  Specify what level of access the autonomous agent has on your operating system.
                </p>

                <div style={styles.radioGroup}>
                  <label style={{ ...styles.radioLabel, borderColor: config.permissionMode === 'safe' ? '#6366f1' : '#2d3748' }}>
                    <input
                      type="radio"
                      name="permission"
                      value="safe"
                      checked={config.permissionMode === 'safe'}
                      onChange={() => onConfigChange({ permissionMode: 'safe' })}
                    />
                    <div>
                      <div style={styles.radioTitle}>Safe Sandbox Mode</div>
                      <div style={styles.radioSub}>Blocked dangerous commands, read-only file access. Recommended for testing.</div>
                    </div>
                  </label>

                  <label style={{ ...styles.radioLabel, borderColor: config.permissionMode === 'prompt' ? '#6366f1' : '#2d3748' }}>
                    <input
                      type="radio"
                      name="permission"
                      value="prompt"
                      checked={config.permissionMode === 'prompt'}
                      onChange={() => onConfigChange({ permissionMode: 'prompt' })}
                    />
                    <div>
                      <div style={styles.radioTitle}>Confirm Actions (Recommended)</div>
                      <div style={styles.radioSub}>The agent prompts you for confirmation before executing commands or writing files.</div>
                    </div>
                  </label>

                  <label style={{ ...styles.radioLabel, borderColor: config.permissionMode === 'autonomy' ? '#6366f1' : '#2d3748' }}>
                    <input
                      type="radio"
                      name="permission"
                      value="autonomy"
                      checked={config.permissionMode === 'autonomy'}
                      onChange={() => onConfigChange({ permissionMode: 'autonomy' })}
                    />
                    <div>
                      <div style={styles.radioTitle}>Full Autonomy</div>
                      <div style={styles.radioSub}>The assistant runs terminal commands and modifies workspace files automatically. Use with caution.</div>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  backdrop: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(3, 7, 18, 0.75)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  modal: {
    width: '680px',
    height: '450px',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    fontSize: '1.5rem',
    cursor: 'pointer',
  },
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  tabs: {
    width: '200px',
    borderRight: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px 0',
    gap: '4px',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    borderLeft: '3px solid transparent',
    color: '#e2e8f0',
    padding: '10px 16px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.85rem',
    fontWeight: 600,
  },
  pane: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  paneContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  paneHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paneTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#fff',
  },
  scanBtn: {
    fontSize: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#9ca3af',
  },
  uploadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '6px',
    padding: '8px 12px',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: 'fit-content',
  },
  description: {
    fontSize: '0.8rem',
    color: '#9ca3af',
    margin: '0 0 10px 0',
  },
  statusBar: {
    background: 'rgba(99, 102, 241, 0.1)',
    border: '1px solid rgba(99, 102, 241, 0.2)',
    borderRadius: '6px',
    padding: '8px 12px',
    fontSize: '0.75rem',
    color: '#818cf8',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  radioLabel: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    border: '1px solid',
    borderRadius: '8px',
    cursor: 'pointer',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  radioTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#fff',
  },
  radioSub: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginTop: '2px',
  },
};
