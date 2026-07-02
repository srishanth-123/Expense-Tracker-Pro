/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useContext, useRef, useCallback } from 'react';
import api from '../api';

export const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef(null);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Interceptor unwraps response: returns user object directly
          const userData = await api.get('/auth/me');
          setUser(userData);
        } catch (error) {
          console.error("Auth check failed:", error);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email, password) => {
    // Interceptor unwraps response: returns { _id, name, email, token } directly
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('token', data.token);
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout'); // Clears HttpOnly cookie server-side
    } catch {
      // Ignore logout errors — clear client state regardless
    }
    localStorage.removeItem('token');
    setUser(null);
  };

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const userData = await api.get('/auth/me');
        setUser(userData);
      } catch (error) {
        console.error("Failed to refresh user data:", error);
      }
    }
  }, []);

  // Debounced listener — coalesces rapid-fire financialDataUpdated events
  // into a single refreshUser() call.
  // 2000ms window: long enough to absorb burst notifications (e.g. 5 splits
  // settled at once) while still feeling responsive to the user.
  useEffect(() => {
    const handleFinancialUpdate = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        refreshUser();
      }, 2000);
    };
    window.addEventListener('financialDataUpdated', handleFinancialUpdate);
    return () => {
      window.removeEventListener('financialDataUpdated', handleFinancialUpdate);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [refreshUser]);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
