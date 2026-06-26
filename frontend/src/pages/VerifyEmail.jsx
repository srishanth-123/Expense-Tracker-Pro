import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle, XCircle, Wallet, Loader } from 'lucide-react';
import api from '../api';

const VerifyEmail = () => {
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verify = async () => {
      try {
        const response = await api.get(`/auth/verify-email/${token}`);
        setStatus('success');
        setMessage(response.message || 'Email verified successfully!');
      } catch (error) {
        setStatus('error');
        setMessage(error.response?.data?.message || error.message || 'Verification failed');
      }
    };
    if (token) verify();
  }, [token]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{ 
            background: status === 'success' ? 'rgba(16, 185, 129, 0.2)' : status === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(99, 102, 241, 0.2)', 
            padding: '20px', 
            borderRadius: '50%' 
          }}>
            {status === 'loading' && <Loader size={40} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />}
            {status === 'success' && <CheckCircle size={40} color="#10b981" />}
            {status === 'error' && <XCircle size={40} color="#ef4444" />}
          </div>
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '12px' }}>
          {status === 'loading' ? 'Verifying...' : status === 'success' ? 'Email Verified!' : 'Verification Failed'}
        </h1>
        
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px', lineHeight: 1.6 }}>
          {status === 'loading' ? 'Please wait while we verify your email address...' : message}
        </p>

        {status !== 'loading' && (
          <Link 
            to={status === 'success' ? '/' : '/login'} 
            className="btn" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              textDecoration: 'none',
              padding: '12px 24px'
            }}
          >
            <Wallet size={18} />
            {status === 'success' ? 'Go to Dashboard' : 'Back to Login'}
          </Link>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
