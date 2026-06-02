import { useState, useEffect, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  MessageSquare, X, Send, Trash2, Sparkles, CheckCircle, Info, Lock,
  AlertTriangle, TrendingUp, PieChart, Folder 
} from 'lucide-react';
import api from '../api';
import { AuthContext } from '../context/AuthContext';
import './ChatbotWidget.css';

// ─── Helpers for Card Parsing & Formatting ───────────────────────────────────

const parseContent = (content) => {
  try {
    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
      return JSON.parse(content);
    }
  } catch (e) {
    // Treat as raw string if JSON parsing fails
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

// ─── Sub-Component for Rich Messages ─────────────────────────────────────────

const StructuredMessageContent = ({ msg, onSendAction, isLast }) => {
  const parsed = parseContent(msg.content);
  
  if (!parsed) {
    return <div className="formatted-text">{renderFormattedText(msg.content)}</div>;
  }

  const { responseType } = parsed;

  if (responseType === 'follow_up') {
    const { message, collectedFields, missingFields } = parsed;
    return (
      <div className="structured-card follow-up-card">
        <div className="card-message">{renderFormattedText(message)}</div>
        {Object.keys(collectedFields || {}).length > 0 && (
          <div className="fields-tracker">
            <div className="tracker-title">Collected Fields:</div>
            <div className="fields-badges-container">
              {Object.entries(collectedFields || {}).map(([key, val]) => {
                if (val === null || val === undefined) return null;
                return (
                  <span key={key} className="field-badge collected" id={`badge-collected-${key}`}>
                    <span className="field-name">{formatFieldName(key)}:</span>
                    <span className="field-val">{formatFieldValue(key, val)}</span>
                  </span>
                );
              })}
              {(missingFields || []).map((key) => (
                <span key={key} className="field-badge missing" id={`badge-missing-${key}`}>
                  <span className="field-name">{formatFieldName(key)}</span>
                  <span className="field-status">?</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (responseType === 'disambiguation') {
    const { message, candidates } = parsed;
    return (
      <div className="structured-card disambiguation-card" id="chatbot-disambiguation-card">
        <div className="disambiguation-header">
          <Info size={14} className="info-icon" />
          <span>Disambiguation</span>
        </div>
        <div className="card-message">{renderFormattedText(message)}</div>
        <div className="candidates-list">
          {isLast ? (
            (candidates || []).map((c, i) => (
              <button
                key={c.id || i}
                type="button"
                className="btn-candidate-option"
                onClick={() => onSendAction((i + 1).toString())}
              >
                <span className="candidate-index">{i + 1}</span>
                <span className="candidate-label">{c.label}</span>
              </button>
            ))
          ) : (
            <div className="candidates-expired">
              {(candidates || []).map((c, i) => (
                <div key={c.id || i} className="candidate-item-expired">
                  {i + 1}. {c.label}
                </div>
              ))}
              <div className="expired-footer-label">Selection Expired</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (responseType === 'confirmation') {
    const { message, intent } = parsed;
    const displayMsg = message ? message.replace(/Shall I go ahead\?.*$/i, '').trim() : '';

    return (
      <div className="structured-card confirmation-card" id="chatbot-confirmation-card">
        <div className="confirmation-header">
          <Sparkles size={14} className="sparkle-icon-pulse" />
          <span>Confirm Action</span>
        </div>
        <div className="confirmation-body">
          <div className="action-type-badge" id={`action-badge-${intent}`}>
            {getIntentIcon(intent)}
            <span>{getIntentTitle(intent)}</span>
          </div>
          <div className="confirmation-details-text">
            {renderFormattedText(displayMsg)}
          </div>
        </div>
        {isLast ? (
          <div className="confirmation-actions">
            <button 
              type="button" 
              className="btn-confirm-action" 
              id="btn-confirm-yes"
              onClick={() => onSendAction('yes')}
            >
              Yes, proceed
            </button>
            <button 
              type="button" 
              className="btn-cancel-action" 
              id="btn-confirm-no"
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
      <div className={`structured-card result-card ${success ? 'success' : 'failure'}`} id="chatbot-result-card">
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

// ─── Main Chatbot Widget Component ──────────────────────────────────────────

const ChatbotWidget = () => {
  const { user, refreshUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Subscription and usage limits state
  const [usage, setUsage] = useState({ isPro: false, limit: 5, used: 0, remaining: 5 });
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);

  // Suggested questions
  const suggestions = [
    "Analyze my budget",
    "Where did I spend the most?",
    "Give me financial tips",
    "Predict next month's expense"
  ];

  const fetchHistory = async () => {
    try {
      const res = await api.get('/chat/history');
      const dataObj = res.data ? res : { data: res, ...res };
      setMessages(dataObj.data || []);
      
      if (dataObj.remaining !== undefined) {
        setUsage({
          isPro: dataObj.isPro,
          limit: dataObj.limit,
          used: dataObj.used,
          remaining: dataObj.remaining
        });
      } else {
        setUsage({
          isPro: !!user.isPro,
          limit: 5,
          used: 0,
          remaining: user.isPro ? 9999 : 5
        });
      }
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  };

  useEffect(() => {
    if (user && isOpen) {
      fetchHistory();
    }
  }, [user, isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    if (!textToSend) setInputText('');

    // Append user message immediately
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await api.post('/chat/message', { message: text });
      const dataObj = res.data ? res : { data: res, ...res };
      const assistantMsg = dataObj.data || dataObj;
      setMessages(prev => [...prev, { role: 'model', content: assistantMsg.content || assistantMsg }]);
      
      if (dataObj.remaining !== undefined) {
        setUsage({
          isPro: dataObj.isPro,
          limit: dataObj.limit,
          used: dataObj.used,
          remaining: dataObj.remaining
        });
      }

      // Check if action was completed successfully to refresh user context/wallet balance
      if (dataObj.structured && dataObj.structured.responseType === 'action_result' && dataObj.structured.success) {
        await refreshUser();
        window.dispatchEvent(new CustomEvent('financialDataUpdated', {
          detail: { actionType: dataObj.structured.actionType }
        }));
      }
    } catch (err) {
      if (err.response?.data?.isLimitExceeded) {
        setUsage(prev => ({ ...prev, remaining: 0 }));
      }
      const serverMsg = err.response?.data?.message || "Sorry, I ran into an error. Please try again.";
      setMessages(prev => [...prev, { role: 'model', content: serverMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      setErrorMsg('');
      setSuccessMsg('');
      setSubmittingUpgrade(true);
      const res = await api.post('/payment/subscribe-pro');
      const dataObj = res.data ? res : { message: res.message, ...res };
      setSuccessMsg(dataObj.message || "Successfully upgraded to Pro!");
      await refreshUser(); // refresh global AuthContext profile
      await fetchHistory(); // refresh local chat logs and limits
      setTimeout(() => {
        setSuccessMsg('');
      }, 5000);
    } catch (err) {
      setErrorMsg(err.response?.data?.message || err.message || "Upgrade failed.");
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const handleClear = async () => {
    if (window.confirm("Are you sure you want to clear chat history?")) {
      try {
        await api.delete('/chat/history');
        setMessages([]);
        fetchHistory(); // reset usage state
      } catch (err) {
        console.error("Failed to clear chat history:", err);
      }
    }
  };

  if (!user) return null;

  return (
    <div className="chatbot-widget-container">
      {/* Floating Chat Bubble */}
      {!isOpen && (
        <button className="chat-bubble-btn" onClick={() => setIsOpen(true)} title="AI Assistant">
          <MessageSquare size={24} />
          <span className="badge-new">AI</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="chat-window-card animate-slide-up">
          <div className="chat-header">
            <div className="chat-title-container">
              <div className="chat-ai-icon">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="chat-title">AI Finance Assistant</h3>
                <span className="chat-status">
                  {user.isPro ? (
                    <span className="badge-pro"><CheckCircle size={10} /> Pro Member</span>
                  ) : (
                    <span className="badge-free">Free Tier</span>
                  )}
                </span>
              </div>
            </div>
            <div className="header-actions">
              {messages.length > 0 && (
                <button className="clear-chat-btn" onClick={handleClear} title="Clear history">
                  <Trash2 size={16} />
                </button>
              )}
              <button className="close-chat-btn" onClick={() => setIsOpen(false)}>
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Pro Promotion Banner */}
          {!user.isPro && (
            <div className="pro-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={14} />
                {usage.remaining === 0 ? (
                  <span>Limit reached! Upgrade to Pro to continue.</span>
                ) : (
                  <span>{usage.remaining} free messages left.</span>
                )}
              </div>
              {usage.remaining > 0 && (
                <button 
                  onClick={handleUpgrade}
                  disabled={submittingUpgrade}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: 'white',
                    border: 'none',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'opacity 0.2s'
                  }}
                >
                  {submittingUpgrade ? "..." : "Upgrade (₹499)"}
                </button>
              )}
            </div>
          )}

          {/* Messages Area */}
          <div className="chat-messages-container">
            {messages.length === 0 ? (
              <div className="empty-chat-state">
                <Sparkles size={28} className="empty-sparkle" />
                <p>Hello {user.name.split(' ')[0]}! Ask me anything about your current budgets, categories, or recent spending intensity.</p>
                <div className="suggestions-grid">
                  {suggestions.map((s, i) => (
                    <button 
                      key={i} 
                      className="suggestion-chip" 
                      onClick={() => handleSend(s)}
                      disabled={!user.isPro && usage.remaining === 0}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index} className={`message-bubble-wrapper ${msg.role}`}>
                  <div className={`message-bubble ${msg.role}`}>
                    <StructuredMessageContent 
                      msg={msg} 
                      onSendAction={handleSend}
                      isLast={index === messages.length - 1}
                    />
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="message-bubble-wrapper model">
                <div className="message-bubble model typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}

            {/* Pro Upgrade CTA inside chat if limit reached */}
            {!user.isPro && usage.remaining === 0 && (
              <div className="pro-upgrade-card animate-fade-in">
                <div className="pro-upgrade-title">
                  <Lock size={16} color="#8b5cf6" /> Limit Reached
                </div>
                <p className="pro-upgrade-desc">
                  You have used all 5 free messages for this month. Upgrade to Pro for unlimited chat, budget analysis, and spending predictions.
                </p>
                {successMsg && <div className="alert-success-sub">{successMsg}</div>}
                {errorMsg && (
                  <div className="alert-error-sub">
                    <span>{errorMsg}</span>
                    {errorMsg.toLowerCase().includes("balance") && (
                      <button 
                        className="wallet-redirect-link" 
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          navigate('/wallet');
                        }}
                      >
                        Go to Wallet to Top Up
                      </button>
                    )}
                  </div>
                )}
                {!successMsg && (
                  <button 
                    className="upgrade-action-btn"
                    onClick={handleUpgrade}
                    disabled={submittingUpgrade}
                  >
                    {submittingUpgrade ? "Upgrading..." : "Upgrade to Pro for ₹499"}
                  </button>
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
            <input 
              type="text" 
              placeholder={!user.isPro && usage.remaining === 0 ? "Upgrade to Pro to continue..." : "Ask about your expenses..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={loading || (!user.isPro && usage.remaining === 0)}
            />
            <button type="submit" className="send-msg-btn" disabled={loading || !inputText.trim() || (!user.isPro && usage.remaining === 0)}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default ChatbotWidget;
