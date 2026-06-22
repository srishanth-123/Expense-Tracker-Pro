import { createContext, useState, useEffect, useCallback, useContext } from 'react';
import * as chatbotApi from '../services/chatbotApi';
import { AuthContext } from './AuthContext';

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { user, refreshUser } = useContext(AuthContext);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [error, setError] = useState(null);

  const userId = user?._id;

  // Fetch all sessions
  const fetchSessions = useCallback(async (selectFirst = false) => {
    if (!userId) return;
    try {
      setSessionsLoading(true);
      const data = await chatbotApi.getSessions();
      setSessions(data || []);
      
      if (selectFirst && data && data.length > 0) {
        setActiveSessionId(data[0]._id);
      } else if (data && data.length === 0) {
        // Auto-create a session if none exist
        const newSess = await chatbotApi.createSession("First Conversation");
        setSessions([newSess]);
        setActiveSessionId(newSess._id);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load chat sessions.");
    } finally {
      setSessionsLoading(false);
    }
  }, [userId]);

  // Fetch messages for active session
  const fetchMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const res = await chatbotApi.getSessionMessages(sessionId);
      const msgs = res.data || res;
      setMessages(msgs || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      setError("Failed to load messages.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (userId) {
      fetchSessions(true);
    } else {
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [userId, fetchSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, fetchMessages]);

  // Create new session
  const handleCreateSession = async (title = "New Conversation") => {
    try {
      setLoading(true);
      const newSess = await chatbotApi.createSession(title);
      setSessions(prev => [newSess, ...prev]);
      setActiveSessionId(newSess._id);
      return newSess;
    } catch (err) {
      setError("Failed to create session.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Rename session
  const handleRenameSession = async (sessionId, newTitle) => {
    try {
      const updated = await chatbotApi.renameSession(sessionId, newTitle);
      setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, title: updated.title } : s));
    } catch (err) {
      setError("Failed to rename session.");
      console.error(err);
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId) => {
    try {
      setLoading(true);
      await chatbotApi.deleteSession(sessionId);
      
      const updatedSessions = sessions.filter(s => s._id !== sessionId);
      setSessions(updatedSessions);

      if (activeSessionId === sessionId) {
        if (updatedSessions.length > 0) {
          setActiveSessionId(updatedSessions[0]._id);
        } else {
          // If no sessions left, create a fresh one
          const freshSess = await chatbotApi.createSession("First Conversation");
          setSessions([freshSess]);
          setActiveSessionId(freshSess._id);
        }
      }
    } catch (err) {
      setError("Failed to delete session.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Send message
  const handleSendMessage = async (text) => {
    if (!text || !text.trim() || !activeSessionId || loading) return;

    const trimmedText = text.trim();
    const userMsg = { role: 'user', content: trimmedText, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    setError(null);

    try {
      const assistantMsg = await chatbotApi.sendMessageToSession(activeSessionId, trimmedText);
      setMessages(prev => [...prev, assistantMsg]);
      
      const activeSess = sessions.find(s => s._id === activeSessionId);
      if (activeSess && (activeSess.title === "New Conversation" || activeSess.title === "First Conversation")) {
        const words = trimmedText.split(/\s+/).slice(0, 3).join(" ");
        if (words.length > 0) {
          handleRenameSession(activeSessionId, words + "...");
        }
      }

      try {
        const parsed = JSON.parse(assistantMsg.content);
        if (parsed && parsed.responseType === 'action_result' && parsed.success) {
          if (refreshUser) await refreshUser();
          window.dispatchEvent(new CustomEvent('financialDataUpdated', {
            detail: { actionType: parsed.actionType }
          }));
        }
      } catch {
        // Content is not JSON, normal text response
      }

    } catch (err) {
      const serverMsg = err.message || "Sorry, I ran into an error. Please try again.";
      setMessages(prev => [...prev, { role: 'model', content: serverMsg, createdAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ChatContext.Provider value={{
      sessions,
      activeSessionId,
      setActiveSessionId,
      messages,
      loading,
      sessionsLoading,
      error,
      setError,
      handleCreateSession,
      handleRenameSession,
      handleDeleteSession,
      handleSendMessage
    }}>
      {children}
    </ChatContext.Provider>
  );
};
