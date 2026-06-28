import React from 'react';
import { Terminal, FileText, Search, ShieldAlert, CheckCircle2, XCircle, Play } from 'lucide-react';

export interface ActionItem {
  action: string;
  arguments: any;
  status: 'pending' | 'success' | 'failed' | 'blocked' | 'rejected';
  result?: string;
}

interface AgentActionLogProps {
  actions: ActionItem[];
}

export const AgentActionLog: React.FC<AgentActionLogProps> = ({ actions }) => {
  const getActionIcon = (action: string) => {
    switch (action) {
      case 'run_system_command':
        return <Terminal size={16} className="text-indigo-400" style={{ color: '#818cf8' }} />;
      case 'read_file':
      case 'write_file':
        return <FileText size={16} style={{ color: '#38bdf8' }} />;
      case 'google_search':
      case 'web_scrape':
        return <Search size={16} style={{ color: '#fbbf24' }} />;
      default:
        return <Play size={16} style={{ color: '#a78bfa' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return '#10b981';
      case 'failed':
        return '#ef4444';
      case 'blocked':
      case 'rejected':
        return '#f97316';
      default:
        return '#6366f1';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={14} style={{ color: '#10b981' }} />;
      case 'failed':
        return <XCircle size={14} style={{ color: '#ef4444' }} />;
      case 'blocked':
      case 'rejected':
        return <ShieldAlert size={14} style={{ color: '#f97316' }} />;
      default:
        return (
          <span style={styles.loaderPulse} className="pulse-accent" />
        );
    }
  };

  const formatArgs = (action: string, args: any) => {
    if (!args) return '';
    if (action === 'run_system_command') return args.command || '';
    if (action === 'read_file' || action === 'write_file' || action === 'list_directory') return args.path || '';
    if (action === 'google_search') return args.query || '';
    if (action === 'web_scrape') return args.url || '';
    return JSON.stringify(args);
  };

  return (
    <div className="glass-panel" style={styles.container}>
      <div style={styles.header}>
        <Terminal size={18} style={{ color: '#6366f1' }} />
        <span style={styles.title}>Agent Execution Log</span>
      </div>

      <div style={styles.logList}>
        {actions.length === 0 ? (
          <div style={styles.emptyState}>No autonomous actions taken yet.</div>
        ) : (
          actions.map((item, idx) => (
            <div key={idx} style={{ ...styles.logItem, borderLeftColor: getStatusColor(item.status) }}>
              <div style={styles.logHeader}>
                <div style={styles.actionName}>
                  {getActionIcon(item.action)}
                  <span style={styles.actionText}>{item.action}</span>
                </div>
                <div style={styles.statusBadge}>
                  {getStatusIcon(item.status)}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: getStatusColor(item.status) }}>
                    {item.status.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={styles.argText}>
                <code>{formatArgs(item.action, item.arguments)}</code>
              </div>
              {item.result && (
                <details style={styles.details}>
                  <summary style={styles.summary}>View Output</summary>
                  <pre style={styles.output}>{item.result}</pre>
                </details>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '220px',
    minHeight: '220px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    paddingBottom: '8px',
  },
  title: {
    fontSize: '0.9rem',
    fontWeight: 700,
    letterSpacing: '0.5px',
    color: '#e2e8f0',
  },
  logList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
    overflowY: 'auto' as const,
    flex: 1,
    paddingRight: '4px',
  },
  emptyState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: '#6b7280',
    fontSize: '0.85rem',
    fontStyle: 'italic',
  },
  logItem: {
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderLeftWidth: '3px',
    borderRadius: '6px',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionName: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  actionText: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#f3f4f6',
    fontFamily: 'monospace',
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  argText: {
    fontSize: '0.75rem',
    color: '#9ca3af',
    background: 'rgba(0, 0, 0, 0.2)',
    padding: '4px 8px',
    borderRadius: '4px',
    overflowX: 'auto' as const,
    whiteSpace: 'nowrap' as const,
  },
  loaderPulse: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#6366f1',
    display: 'inline-block',
  },
  details: {
    marginTop: '4px',
  },
  summary: {
    fontSize: '0.75rem',
    color: '#818cf8',
    cursor: 'pointer',
    userSelect: 'none' as const,
    outline: 'none',
  },
  output: {
    marginTop: '6px',
    background: 'rgba(0, 0, 0, 0.4)',
    padding: '8px',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontFamily: 'monospace',
    overflowX: 'auto' as const,
    whiteSpace: 'pre-wrap' as const,
    color: '#d1d5db',
    maxHeight: '120px',
    overflowY: 'auto' as const,
    border: '1px solid rgba(255, 255, 255, 0.05)',
  },
};
