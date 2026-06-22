import { useState, useEffect, useRef, useContext } from 'react';
import { 
  MessageSquare, Plus, Edit3, Trash2, Send, CheckCircle, 
  AlertTriangle, TrendingUp, PieChart, Folder, Check, X, ArrowUpRight, Bot, Sparkles
} from 'lucide-react';
import { useChat } from '../../hooks/chat/useChat';
import { AuthContext } from '../../context/AuthContext';
import ConfirmModal from '../../components/ui/ConfirmModal';
import './ChatPage.css';

// ─── Helpers for Card Parsing & Formatting ───────────────────────────────────
const parseContent = (content) => {
  try {
    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
      return JSON.parse(content);
    }
  } catch {
    // raw string
  }
  return null;
};

const getIntentIcon = (intent) => {
  if (intent.includes('TRANSACTION')) return <TrendingUp size={16} />;
  if (intent.includes('BUDGET')) return <PieChart size={16} />;
  if (intent.includes('CATEGORY')) return <Folder size={16} />;
  return <Sparkles size={16} />;
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
        <li key={lineIdx} className="chat-list-item">
          {parsedLine}
        </li>
      );
    }

    return (
      <p key={lineIdx} className="chat-paragraph">
        {parsedLine}
      </p>
    );
  });
};

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
      <div className="structured-card choice-card">
        <div className="choice-header">
          <AlertTriangle size={16} className="warn-icon" />
          <span className="choice-title">Which item did you mean?</span>
        </div>
        <p className="choice-text">{message}</p>
        <div className="candidates-list">
          {candidates.map((cand, idx) => (
            <button
              key={cand.id}
              type="button"
              className="candidate-option-btn"
              disabled={loading}
              onClick={() => onSendAction((idx + 1).toString())}
            >
              <span className="candidate-index">{idx + 1}</span>
              <span className="candidate-label">{cand.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (responseType === 'confirmation') {
    const { intent, fields } = parsed;
    return (
      <div className="structured-card confirmation-card" id="chat-confirm-card">
        <div className="confirm-header">
          {getIntentIcon(intent)}
          <span className="confirm-title">{getIntentTitle(intent)}</span>
        </div>
        <div className="confirm-body">
          <p className="confirm-intro">Please confirm the proposed details:</p>
          <div className="details-diff-box">
            {Object.entries(fields).map(([key, val]) => {
              if (val === null || val === undefined) return null;
              return (
                <div key={key} className="diff-row">
                  <span className="diff-key">{formatFieldName(key)}</span>
                  <span className="diff-val">{formatFieldValue(key, val)}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        {isLast ? (
          <div className="confirm-actions">
            <button 
              type="button" 
              className="btn-confirm-action"
              disabled={loading}
              onClick={() => onSendAction('yes')}
            >
              Yes, proceed
            </button>
            <button 
              type="button" 
              className="btn-cancel-action"
              disabled={loading}
              onClick={() => onSendAction('cancel')}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="confirmation-expired-label">
            Expired Confirmation
          </div>
        )}
      </div>
    );
  }

  if (responseType === 'action_result') {
    const { success, message, actionType, data } = parsed;
    return (
      <div className={`structured-card result-card ${success ? 'success' : 'failure'}`}>
        <div className="result-header">
          {success ? (
            <CheckCircle size={18} className="success-icon" />
          ) : (
            <AlertTriangle size={18} className="error-icon" />
          )}
          <span className="result-title">{success ? 'Action Successful' : 'Action Failed'}</span>
        </div>
        <div className="result-body">
          <p className="result-message">{message}</p>
          {success && data && (
            <div className="result-details-box">
              {actionType.includes('TRANSACTION') && (
                <div className="result-item-info">
                  <span className="info-label">Transaction:</span>
                  <span className="info-value">{data.description || 'No description'} (₹{data.amount})</span>
                </div>
              )}
              {actionType.includes('BUDGET') && (
                <div className="result-item-info">
                  <span className="info-label">Budget Limit:</span>
                  <span className="info-value">₹{data.limit} ({data.month}/{data.year})</span>
                </div>
              )}
              {actionType.includes('CATEGORY') && (
                <div className="result-item-info">
                  <span className="info-label">Category Name:</span>
                  <span className="info-value">{data.name}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <div className="formatted-text">{renderFormattedText(msg.content)}</div>;
};

// ─── Main Chat Page Component ────────────────────────────────────────────────
const ChatPage = () => {
  const { user } = useContext(AuthContext);
  const [inputText, setInputText] = useState('');
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState({ isOpen: false, sessionId: null });
  const messagesEndRef = useRef(null);

  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    messages,
    loading,
    sessionsLoading,
    handleCreateSession,
    handleRenameSession,
    handleDeleteSession,
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

  const activeSession = sessions.find(s => s._id === activeSessionId);

  // Suggestions list
  const suggestions = [
    "Analyze my budget",
    "Where did I spend the most?",
    "Add a ₹250 Food expense",
    "Spent 500 on Shopping",
    "Delete my Food expense of 250",
    "Compare this month vs last month",
    "Predict next month's expense"
  ];

  return (
    <div className="chat-page-container">
      {/* 1. Left Session Sidebar */}
      <div className="chat-sidebar">
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={() => handleCreateSession()}>
            <Plus size={18} />
            <span>New Chat</span>
          </button>
        </div>

        <div className="sessions-list">
          {sessionsLoading ? (
            <div className="sessions-loader">
              <div className="spin-dot"></div>
              <span>Loading chats...</span>
            </div>
          ) : (
            sessions.map((sess) => {
              const isSelected = sess._id === activeSessionId;
              const isEditing = sess._id === editingSessionId;

              return (
                <div key={sess._id} className={`session-item ${isSelected ? 'active' : ''}`}>
                  <MessageSquare size={16} className="session-icon" />
                  
                  {isEditing ? (
                    <div className="session-rename-input-box">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="rename-input"
                        autoFocus
                      />
                      <button 
                        className="save-rename-btn"
                        onClick={() => {
                          handleRenameSession(sess._id, editTitle);
                          setEditingSessionId(null);
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button 
                        className="cancel-rename-btn"
                        onClick={() => setEditingSessionId(null)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <span 
                      className="session-title"
                      onClick={() => setActiveSessionId(sess._id)}
                    >
                      {sess.title}
                    </span>
                  )}

                  {!isEditing && (
                    <div className="session-actions">
                      <button 
                        className="sess-action-btn edit" 
                        title="Rename Chat"
                        onClick={() => {
                          setEditingSessionId(sess._id);
                          setEditTitle(sess.title);
                        }}
                      >
                        <Edit3 size={12} />
                      </button>
                      <button 
                        className="sess-action-btn delete" 
                        title="Delete Chat"
                        onClick={() => setDeleteConfirm({ isOpen: true, sessionId: sess._id })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Chat Feed Area */}
      <div className="chat-feed-pane">
        <div className="feed-header">
          <div className="header-info">
            <div className="fp-page-avatar">
              <Bot size={16} color="white" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="feed-title">
                <span>FinPilot</span>
                <span className="fp-page-badge">AI</span>
              </h3>
              <span className="fp-session-name">{activeSession?.title || "New conversation"}</span>
            </div>
          </div>
          {user && (
            <div className={`user-tier-badge ${user.isPro ? 'pro' : 'free'}`}>
              {user.isPro ? "✦ Pro" : "Free · 5/mo"}
            </div>
          )}
        </div>

        {/* Scrollable Message History */}
        <div className="feed-messages">
          {messages.length === 0 && !loading ? (
            <div className="welcome-chat-overlay">
              <div className="fp-welcome-icon-wrap">
                <Bot size={36} color="white" strokeWidth={2} />
              </div>
              <h2>FinPilot AI</h2>
              <p className="fp-welcome-subtitle">Your personal finance assistant</p>
              <p>
                Track expenses, manage budgets, analyze spending, and edit transactions — 
                all through natural conversation.
              </p>
              
              <div className="suggested-prompts-grid">
                {suggestions.map((sug, idx) => (
                  <button key={idx} className="suggestion-chip" onClick={() => handleSend(sug)}>
                    <span>{sug}</span>
                    <ArrowUpRight size={14} className="sug-arrow" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-bubbles-feed">
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user';
                const isLast = idx === messages.length - 1;

                return (
                  <div key={msg._id || idx} className={`message-bubble-row ${isUser ? 'user-row' : 'model-row'}`}>
                    <div className="bubble-avatar-wrapper">
                      {isUser ? (
                        <div className="avatar user-avatar">{user?.name?.charAt(0)?.toUpperCase() || 'U'}</div>
                      ) : (
                        <div className="avatar model-avatar"><Bot size={14} color="white" strokeWidth={2.5} /></div>
                      )}
                    </div>
                    <div className="bubble-content-card">
                      <StructuredMessageContent 
                        msg={msg} 
                        onSendAction={handleSend} 
                        isLast={isLast}
                        loading={loading}
                      />
                      <span className="bubble-timestamp">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="message-bubble-row model-row">
                  <div className="bubble-avatar-wrapper">
                    <div className="avatar model-avatar"><Bot size={14} color="white" strokeWidth={2.5} /></div>
                  </div>
                  <div className="bubble-content-card loading-card">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Chat Input Bar */}
        <div className="feed-footer">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="input-form-wrapper"
          >
            <input
              type="text"
              placeholder="Message FinPilot AI..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="chat-prompt-input"
              disabled={loading}
            />
            <button type="submit" className="chat-send-btn" disabled={loading || !inputText.trim()}>
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {/* Delete Conversation Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        onClose={() => setDeleteConfirm({ isOpen: false, sessionId: null })}
        onConfirm={() => {
          handleDeleteSession(deleteConfirm.sessionId);
          setDeleteConfirm({ isOpen: false, sessionId: null });
        }}
        title="Delete conversation?"
        message="This will permanently clear all of this conversation's history. This action cannot be undone."
        confirmText="Delete"
        isDanger={true}
      />
    </div>
  );
};

export default ChatPage;
