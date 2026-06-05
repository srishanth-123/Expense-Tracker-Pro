import React, { useState, useEffect, useRef, useContext } from 'react';
import { 
  Send, X, ArrowUpRight, MessageSquare, 
  TrendingUp, PieChart, Folder, AlertTriangle, CheckCircle, Bot, Zap
} from 'lucide-react';
import { useChat } from '../hooks/chat/useChat';
import { AuthContext } from '../context/AuthContext';
import './AIChatPanel.css';

// ─── Helpers for Card Parsing & Formatting ───────────────────────────────────
const parseContent = (content) => {
  try {
    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
      return JSON.parse(content);
    }
  } catch (e) {
    // raw string
  }
  return null;
};

const getIntentIcon = (intent) => {
  if (intent.includes('TRANSACTION')) return <TrendingUp size={14} />;
  if (intent.includes('BUDGET')) return <PieChart size={14} />;
  if (intent.includes('CATEGORY')) return <Folder size={14} />;
  return <Zap size={14} />;
};

const getIntentTitle = (intent) => {
  const prefix = intent.startsWith('DELETE') ? 'Delete' : intent.startsWith('UPDATE') ? 'Edit' : 'Create';
  const type = intent.includes('TRANSACTION') ? 'Transaction' : intent.includes('BUDGET') ? 'Budget' : 'Category';
  return `${prefix} ${type}`;
};

const formatFieldName = (key) => {
  switch (key) {
    case 'amount': return 'Amount';
    case 'type': return 'Type';
    case 'categoryName': return 'Category';
    case 'description': return 'Description';
    case 'date': return 'Date';
    case 'budgetLimit': return 'Limit';
    case 'month': return 'Month';
    case 'year': return 'Year';
    case 'categoryNewName': return 'Category Name';
    case 'newAmount': return 'New Amount';
    case 'newLimit': return 'New Limit';
    case 'newDescription': return 'New Description';
    case 'newCategoryName': return 'New Name';
    default: return key.charAt(0).toUpperCase() + key.slice(1);
  }
};

const formatFieldValue = (key, val) => {
  if (key === 'amount' || key === 'budgetLimit' || key === 'newAmount' || key === 'newLimit') {
    return `₹${val}`;
  }
  if (key === 'type') {
    return val === 'expense' ? 'Expense' : 'Income';
  }
  return val;
};

const renderFormattedText = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const isListItem = line.trim().startsWith('•') || line.trim().startsWith('-');
    const cleanLine = isListItem ? line.trim().replace(/^[•-]\s*/, '') : line;

    const parts = cleanLine.split(/\*\*([\s\S]*?)\*\*/g);
    const parsedLine = parts.map((part, partIdx) => {
      if (partIdx % 2 === 1) {
        return <strong key={partIdx}>{part}</strong>;
      }
      return part;
    });

    if (isListItem) {
      return (
        <li key={lineIdx} className="chat-list-item" style={{ fontSize: '0.83rem', marginLeft: '12px', marginBottom: '2px' }}>
          {parsedLine}
        </li>
      );
    }

    return (
      <p key={lineIdx} style={{ margin: '3px 0', fontSize: '0.83rem', lineHeight: '1.5' }}>
        {parsedLine}
      </p>
    );
  });
};

// ─── FinPilot AI Avatar ──────────────────────────────────────────────────────
const FinPilotAvatar = ({ size = 28 }) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 2px 8px rgba(99, 102, 241, 0.4)',
    position: 'relative'
  }}>
    <Bot size={size * 0.55} color="white" strokeWidth={2.5} />
    <div style={{
      position: 'absolute',
      bottom: -1,
      right: -1,
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: '#10b981',
      border: '2px solid var(--surface)'
    }} />
  </div>
);

const StructuredMessageContent = ({ msg, onSendAction, isLast, loading }) => {
  const parsed = parseContent(msg.content);
  if (!parsed) {
    return <div className="formatted-text">{renderFormattedText(msg.content)}</div>;
  }

  const { responseType } = parsed;

  if (responseType === 'follow_up') {
    const { message } = parsed;
    return <div className="formatted-text">{renderFormattedText(message)}</div>;
  }

  if (responseType === 'disambiguation') {
    const { message, candidates } = parsed;
    return (
      <div className="fp-structured-card fp-choice-card">
        <div className="fp-card-header" style={{ color: '#f59e0b' }}>
          <AlertTriangle size={14} />
          <span>Select matching item</span>
        </div>
        <p className="fp-card-text">{message}</p>
        <div className="fp-candidates-list">
          {candidates.map((cand, idx) => (
            <button
              key={cand.id}
              type="button"
              className="fp-candidate-btn"
              disabled={loading}
              onClick={() => onSendAction((idx + 1).toString())}
            >
              <span className="fp-candidate-idx">{idx + 1}</span>
              <span className="fp-candidate-label">{cand.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (responseType === 'confirmation') {
    const { intent, fields } = parsed;
    return (
      <div className="fp-structured-card fp-confirm-card">
        <div className="fp-card-header" style={{ color: 'var(--primary)' }}>
          {getIntentIcon(intent)}
          <span>{getIntentTitle(intent)}</span>
        </div>
        <div className="fp-confirm-body">
          <p className="fp-card-text" style={{ marginBottom: '8px' }}>Please confirm details:</p>
          <div className="fp-details-grid">
            {Object.entries(fields).map(([key, val]) => {
              if (val === null || val === undefined) return null;
              return (
                <div key={key} className="fp-detail-row">
                  <span className="fp-detail-key">{formatFieldName(key)}</span>
                  <span className="fp-detail-val">{formatFieldValue(key, val)}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        {isLast ? (
          <div className="fp-action-btns">
            <button 
              type="button" 
              className="fp-btn-confirm"
              disabled={loading}
              onClick={() => onSendAction('yes')}
            >
              ✓ Confirm
            </button>
            <button 
              type="button" 
              className="fp-btn-cancel"
              disabled={loading}
              onClick={() => onSendAction('cancel')}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="fp-expired-label">Expired</div>
        )}
      </div>
    );
  }

  if (responseType === 'action_result') {
    const { success, message } = parsed;
    return (
      <div className={`fp-structured-card fp-result-card ${success ? 'fp-success' : 'fp-failure'}`}>
        <div className="fp-card-header" style={{ color: success ? '#10b981' : '#ef4444' }}>
          {success ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          <span>{success ? 'Success' : 'Failed'}</span>
        </div>
        <p className="fp-card-text">{message}</p>
      </div>
    );
  }

  return <div className="formatted-text">{renderFormattedText(msg.content)}</div>;
};

// ─── Typing Skeleton ─────────────────────────────────────────────────────────
const TypingSkeleton = () => (
  <div className="fp-typing-row">
    <FinPilotAvatar size={26} />
    <div className="fp-typing-bubble">
      <div className="fp-typing-dots">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
);

// ─── Main Panel Component ───────────────────────────────────────────────────
const AIChatPanel = ({ onClose }) => {
  const { user } = useContext(AuthContext);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const {
    messages,
    loading,
    handleSendMessage
  } = useChat();

  const handleSend = (text) => {
    const textToSend = text || inputText;
    if (!textToSend.trim()) return;
    handleSendMessage(textToSend);
    if (!text) setInputText('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    // Focus input when panel opens
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const suggestions = [
    { text: "Add ₹500 food expense", icon: "🍔" },
    { text: "Analyze my budget", icon: "📊" },
    { text: "Spent 300 on Shopping", icon: "🛍️" },
    { text: "Where do I spend most?", icon: "🔍" }
  ];

  return (
    <div className="fp-panel">
      {/* ─── Premium Header ─── */}
      <div className="fp-header">
        <div className="fp-header-bg" />
        <div className="fp-header-content">
          <div className="fp-brand">
            <div className="fp-avatar-ring">
              <FinPilotAvatar size={32} />
            </div>
            <div>
              <div className="fp-brand-name">
                <span>FinPilot</span>
                <span className="fp-ai-badge">AI</span>
              </div>
              <div className="fp-brand-sub">
                {user?.isPro ? (
                  <span className="fp-pro-tag">✦ Pro</span>
                ) : (
                  <span className="fp-free-tag">Free plan</span>
                )}
                <span className="fp-status-dot" />
                <span>Online</span>
              </div>
            </div>
          </div>
          <button 
            className="fp-close-btn"
            onClick={onClose} 
            title="Close panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ─── Message Feed ─── */}
      <div className="fp-feed">
        {messages.length === 0 && !loading ? (
          <div className="fp-welcome">
            <div className="fp-welcome-glow" />
            <FinPilotAvatar size={48} />
            <h4 className="fp-welcome-title">Hey{user?.name ? `, ${user.name}` : ''}! 👋</h4>
            <p className="fp-welcome-desc">
              I'm your personal finance assistant. Track expenses, manage budgets, and get insights — all through chat.
            </p>
            
            <div className="fp-suggestions">
              {suggestions.map((sug, idx) => (
                <button 
                  key={idx} 
                  className="fp-suggestion-chip"
                  onClick={() => handleSend(sug.text)}
                >
                  <span className="fp-chip-icon">{sug.icon}</span>
                  <span className="fp-chip-text">{sug.text}</span>
                  <ArrowUpRight size={12} className="fp-chip-arrow" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isLast = idx === messages.length - 1;

            return (
              <div 
                key={msg._id || idx} 
                className={`fp-msg-row ${isUser ? 'fp-user' : 'fp-model'}`}
              >
                {!isUser && <FinPilotAvatar size={26} />}
                <div className={`fp-msg-bubble ${isUser ? 'fp-user-bubble' : 'fp-model-bubble'}`}>
                  <StructuredMessageContent 
                    msg={msg} 
                    onSendAction={handleSend} 
                    isLast={isLast}
                    loading={loading}
                  />
                  <div className="fp-msg-time">
                    {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {loading && <TypingSkeleton />}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── Input Area ─── */}
      <div className="fp-input-area">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="fp-input-form"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Message FinPilot AI..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={loading}
            className="fp-input"
          />
          <button 
            type="submit" 
            disabled={loading || !inputText.trim()}
            className="fp-send-btn"
          >
            <Send size={16} />
          </button>
        </form>
        <div className="fp-input-hint">
          FinPilot AI can make mistakes. Verify important info.
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;
