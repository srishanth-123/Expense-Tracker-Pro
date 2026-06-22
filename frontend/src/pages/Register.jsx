import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Wallet, UserPlus, LogIn, Check, X } from 'lucide-react';

const inputStyle = {
  width: '100%',
  background: 'rgba(10, 12, 20, 0.85)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '10px',
  padding: '12px',
  color: '#ffffff',
  fontSize: '0.95rem',
  outline: 'none',
  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
};

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { register } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      setError('Only Gmail addresses (@gmail.com) are allowed.');
      return;
    }
    try {
      await register(name, email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, rgba(15, 17, 26, 0.3) 0%, rgba(10, 10, 15, 0.4) 100%), url("/auth_background.png") no-repeat center center / cover',
      padding: '24px',
      position: 'relative'
    }}>
      <div className="glass-card animate-fade-in" style={{ 
        width: '100%', 
        maxWidth: '440px',
        background: 'rgba(15, 17, 28, 0.75)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        borderRadius: '20px',
        padding: '40px'
      }}>
        {/* Login / Sign Up Toggle Buttons */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.06)',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '28px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <Link
            to="/login"
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'transparent',
              color: 'rgba(255, 255, 255, 0.5)',
              textDecoration: 'none',
              transition: 'all 0.2s ease',
            }}
          >
            <LogIn size={16} /> Login
          </Link>
          <button
            style={{
              flex: 1,
              padding: '10px 0',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'linear-gradient(135deg, #10b981, #34d399)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <UserPlus size={16} /> Sign Up
          </button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '16px', borderRadius: '50%', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <Wallet size={32} color="var(--success)" />
            </div>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.025em', color: '#fff' }}>Create Account</h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '0.88rem', marginTop: '6px' }}>Start tracking your expenses today</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '12px', borderRadius: '8px', color: '#ef4444', marginBottom: '20px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginBottom: '6px' }}>Full Name</label>
            <input 
              type="text" 
              placeholder="John Doe" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="new-name"
              required 
              style={inputStyle}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginBottom: '6px' }}>Email Address (Gmail only)</label>
            <input 
              type="email" 
              placeholder="you@gmail.com" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="new-email"
              required 
              style={inputStyle}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginBottom: '6px' }}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              style={inputStyle}
              onFocus={(e) => {
                e.target.style.borderColor = 'rgba(16, 185, 129, 0.5)';
                e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                e.target.style.boxShadow = 'none';
              }}
            />
            {password.length > 0 && (
              <div style={{
                marginTop: '8px',
                padding: '10px 12px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '0.78rem',
                animation: 'fadeIn 0.2s ease',
              }}>
                {[
                  { label: 'At least 8 characters', valid: password.length >= 8 },
                  { label: 'One uppercase letter', valid: /[A-Z]/.test(password) },
                  { label: 'One number', valid: /\d/.test(password) },
                ].map((rule) => (
                  <div key={rule.label} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: rule.valid ? '#10b981' : 'rgba(255, 255, 255, 0.4)',
                    transition: 'color 0.2s ease',
                  }}>
                    {rule.valid ? <Check size={14} /> : <X size={14} />}
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="btn" style={{ marginTop: '8px', padding: '13px', background: 'linear-gradient(135deg, #10b981, #34d399)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, fontSize: '0.95rem' }}>
            <UserPlus size={18} /> Sign Up
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '28px', fontSize: '0.88rem', color: 'rgba(255, 255, 255, 0.5)' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
