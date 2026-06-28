import React, { useRef, useEffect } from 'react';
import { Send, Eye, ShieldAlert, Check, X, RefreshCw } from 'lucide-react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  statusText: string;
  isProcessing: boolean;
  onOpenSettings: () => void;
  
  // Vision feature
  onAttachImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  attachedImageName: string | null;

  // Pending tool execution approval
  pendingTool: {
    action: string;
    arguments: any;
  } | null;
  onApproveTool: (approved: boolean) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  inputValue,
  onInputChange,
  onSend,
  statusText,
  isProcessing,
  onOpenSettings,
  onAttachImage,
  attachedImageName,
  pendingTool,
  onApproveTool,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusText]);

  // Clean sentiment codes (e.g., [HAPPY]) for rendering text
  const cleanSentimentText = (text: string) => {
    return text.replace(/\[[A-Z_]+\]/g, '').trim();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="glass-panel" style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.agentInfo}>
          <div style={styles.statusDot} className={isProcessing ? 'pulse-glow' : ''} />
          <span style={styles.agentName}>3D Agentic Assistant</span>
        </div>
        <button className="glass-btn-secondary" style={styles.settingsBtn} onClick={onOpenSettings}>
          Settings
        </button>
      </div>

      {/* Messages View */}
      <div style={styles.messageContainer}>
        {messages.length === 0 ? (
          <div style={styles.welcomeContainer}>
            <div style={styles.logoCircle} className="pulse-glow">AI</div>
            <h3 style={{ margin: '12px 0 6px 0', color: '#fff' }}>Hello! I'm your local 3D assistant.</h3>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', maxWidth: '300px' }}>
              I can converse with text and voice, run system commands, search google, and analyze image files.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                ...styles.messageRow,
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  ...styles.bubble,
                  background: msg.role === 'user' 
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.2) 100%)' 
                    : 'rgba(255,255,255,0.03)',
                  borderColor: msg.role === 'user' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)',
                  borderBottomRightRadius: msg.role === 'user' ? '4px' : '12px',
                  borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '12px',
                }}
              >
                <div style={styles.roleLabel}>{msg.role === 'user' ? 'You' : 'Assistant'}</div>
                <div className="markdown-content" style={{ fontSize: '0.9rem' }}>
                  {cleanSentimentText(msg.content)}
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Stream / Thinking Status */}
        {isProcessing && statusText && (
          <div style={styles.messageRow}>
            <div style={{ ...styles.bubble, background: 'rgba(255,255,255,0.01)', borderStyle: 'dashed' }}>
              <div style={styles.roleLabel}>Assistant</div>
              <div style={{ fontSize: '0.85rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={12} className="pulse-glow" style={{ animation: 'spin 2s linear infinite' }} />
                <span>{statusText}</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Action Approval Bar */}
      {pendingTool && (
        <div style={styles.approvalBar} className="glass-panel">
          <div style={styles.approvalHeader}>
            <ShieldAlert size={18} style={{ color: '#f97316' }} />
            <span style={styles.approvalTitle}>Permission Requested</span>
          </div>
          <p style={styles.approvalDesc}>
            The agent wants to execute <strong>{pendingTool.action}</strong>:
          </p>
          <div style={styles.approvalCode}>
            <code>{JSON.stringify(pendingTool.arguments)}</code>
          </div>
          <div style={styles.approvalActions}>
            <button
              style={{ ...styles.actionBtn, background: '#10b981' }}
              onClick={() => onApproveTool(true)}
            >
              <Check size={14} /> Approve Action
            </button>
            <button
              style={{ ...styles.actionBtn, background: '#ef4444' }}
              onClick={() => onApproveTool(false)}
            >
              <X size={14} /> Deny Action
            </button>
          </div>
        </div>
      )}

      {/* Input controls */}
      <div style={styles.inputArea}>
        {attachedImageName && (
          <div style={styles.imageBadge}>
            <Eye size={12} /> {attachedImageName}
          </div>
        )}

        <div style={styles.inputRow}>
          <label htmlFor="attach-image" style={styles.iconBtn}>
            <Eye size={18} />
          </label>
          <input
            id="attach-image"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onAttachImage}
          />
          
          <input
            type="text"
            className="glass-input"
            style={styles.textInput}
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={pendingTool ? "Awaiting your permission above..." : "Ask the assistant anything..."}
            disabled={isProcessing || pendingTool !== null}
          />

          <button
            className="glass-btn"
            style={styles.sendBtn}
            onClick={onSend}
            disabled={isProcessing || pendingTool !== null || (!inputValue.trim() && !attachedImageName)}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  agentInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#10b981',
  },
  agentName: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  settingsBtn: {
    padding: '6px 12px',
    fontSize: '0.75rem',
  },
  messageContainer: {
    flex: 1,
    padding: '16px',
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  welcomeContainer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#9ca3af',
  },
  logoCircle: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    color: '#fff',
    fontSize: '1.5rem',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
  },
  messageRow: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    maxWidth: '80%',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    wordBreak: 'break-word' as const,
  },
  roleLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#6366f1',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  approvalBar: {
    margin: '12px 16px',
    background: 'rgba(249, 115, 22, 0.15)',
    border: '1px solid rgba(249, 115, 22, 0.3)',
    borderRadius: '10px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  approvalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  approvalTitle: {
    fontSize: '0.85rem',
    fontWeight: 700,
    color: '#f97316',
  },
  approvalDesc: {
    margin: 0,
    fontSize: '0.8rem',
    color: '#e2e8f0',
  },
  approvalCode: {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    overflowX: 'auto' as const,
    color: '#ffedd5',
  },
  approvalActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },
  actionBtn: {
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    padding: '6px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  inputArea: {
    padding: '12px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  imageBadge: {
    background: 'rgba(20, 184, 166, 0.15)',
    border: '1px solid rgba(20, 184, 166, 0.3)',
    color: '#14b8a6',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '0.7rem',
    fontWeight: 600,
    width: 'fit-content',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '38px',
    height: '38px',
    borderRadius: '8px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    color: '#9ca3af',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  textInput: {
    flex: 1,
    height: '38px',
    boxSizing: 'border-box' as const,
  },
  sendBtn: {
    width: '38px',
    height: '38px',
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
