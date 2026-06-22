import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await api.post('/auth/forgot-password', { email });
      toast.success(response.message || 'If an account exists, a reset link has been sent.');
      setEmail('');
      
      if (response.resetUrl) {
        toast('Local development: Redirecting to password reset page...', { icon: '🔄' });
        setTimeout(() => {
          window.location.href = response.resetUrl;
        }, 1500);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Unable to send reset link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(99, 102, 241, 0.2)', padding: '16px', borderRadius: '50%' }}>
              <Wallet size={32} color="var(--primary)" />
            </div>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Forgot Password</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>Enter your email and we will send a secure reset link.</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label>Email Address</label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn" disabled={loading} style={{ marginTop: '8px' }}>
            <Mail size={18} /> {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
          Remember your password? <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default ForgotPassword;
