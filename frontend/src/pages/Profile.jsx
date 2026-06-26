import { useState, useContext, useRef, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Camera, User, Mail, Save, X, AlertCircle, Shield, Monitor, Lock, RefreshCw, LogOut, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api';
import { toast } from 'react-hot-toast';
import Card from '../components/ui/Card';

const Profile = () => {
  const { user, refreshUser } = useContext(AuthContext);
  const { theme } = useTheme();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [previewPic, setPreviewPic] = useState(user?.profilePic || '');
  const [newPicBase64, setNewPicBase64] = useState(null);
  const [saving, setSaving] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [picError, setPicError] = useState('');
  const fileInputRef = useRef(null);
  
  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  
  // Sessions
  const [sessions, setSessions] = useState([]);
  const [showSessions, setShowSessions] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  // Audit logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  
  // Resend verification
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await api.get('/auth/sessions');
      setSessions(data || []);
    } catch (err) { toast.error('Failed to load sessions'); }
    finally { setLoadingSessions(false); }
  };

  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const data = await api.get('/auth/audit-logs?limit=20');
      setAuditLogs(data?.logs || []);
    } catch (err) { toast.error('Failed to load audit logs'); }
    finally { setLoadingAuditLogs(false); }
  };

  const handleResendVerification = async () => {
    setResendingVerification(true);
    try {
      await api.post('/auth/resend-verification');
      toast.success('Verification email sent! Check your inbox.');
    } catch (err) { toast.error(err.message || 'Failed to send verification email'); }
    finally { setResendingVerification(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmNewPassword) { toast.error('Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed successfully!');
      setShowChangePassword(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword('');
    } catch (err) { toast.error(err.message || 'Failed to change password'); }
    finally { setChangingPassword(false); }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      toast.success('Session revoked');
      fetchSessions();
    } catch (err) { toast.error('Failed to revoke session'); }
  };

  const handleLogoutAll = async () => {
    if (!confirm('This will log you out from all devices including this one. Continue?')) return;
    try {
      await api.post('/auth/logout-all');
      toast.success('Logged out from all devices');
      localStorage.removeItem('token');
      window.location.href = '/login';
    } catch (err) { toast.error('Failed to logout all devices'); }
  };

  const handleSubscribe = async () => {
    try {
      setProcessingPayment(true);
      if (!window.Razorpay) {
        toast.error("Razorpay SDK failed to load.");
        setProcessingPayment(false);
        return;
      }

      const orderRes = await api.post('/payment/create-order', { amount: 499, purpose: 'subscription' });
      const { orderId, amount, currency, keyId } = orderRes.data?.data || orderRes.data || orderRes;

      let paymentProcessed = false;

      const options = {
        key: keyId, amount, currency,
        name: "ExpenseTracker Pro",
        description: "30-Day Pro Subscription",
        order_id: orderId,
        handler: async function (response) {
          paymentProcessed = true;
          try {
            toast.loading("Verifying payment...");
            await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            toast.dismiss();
            toast.success("Successfully upgraded to PRO!");
            if (refreshUser) await refreshUser();
          } catch {
            toast.dismiss();
            toast.error("Payment verification failed.");
          } finally { setProcessingPayment(false); }
        },
        prefill: { name: user?.name || "User", email: user?.email || "" },
        theme: { color: "#8b5cf6" },
        modal: {
          ondismiss: async function() {
            setProcessingPayment(false);
            if (paymentProcessed) return;
            paymentProcessed = true;
            try {
              await api.post('/payment/fail', { razorpay_order_id: orderId, reason: "Payment cancelled by user" });
            } catch (failLogErr) { console.error("Failed to log subscription payment cancellation:", failLogErr); }
          }
        }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', async function (response) {
        if (paymentProcessed) return;
        paymentProcessed = true;
        const errMsg = response.error?.description || "Payment failed";
        toast.error(`Payment Failed: ${errMsg}`);
        setProcessingPayment(false);
        try {
          await api.post('/payment/fail', {
            razorpay_order_id: response.error?.metadata?.order_id || orderId,
            razorpay_payment_id: response.error?.metadata?.payment_id,
            reason: errMsg
          });
        } catch (failLogErr) { console.error("Failed to log subscription payment failure:", failLogErr); }
      });
      rzp1.open();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to initialize payment");
      setProcessingPayment(false);
    }
  };

  const hasChanges = name !== (user?.name || '') || email !== (user?.email || '') || newPicBase64 !== null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicError('');
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg'].includes(ext)) { setPicError('Only .jpg or .jpeg files are allowed.'); e.target.value = ''; return; }
    if (file.type !== 'image/jpeg') { setPicError('Only JPEG/JPG images are allowed.'); e.target.value = ''; return; }
    if (file.size > 2 * 1024 * 1024) { setPicError('Image must be less than 2MB.'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (event) => { setPreviewPic(event.target.result); setNewPicBase64(event.target.result); };
    reader.readAsDataURL(file);
  };

  const handleRemovePic = () => { setPreviewPic(''); setNewPicBase64(''); setPicError(''); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const payload = {};
      if (name !== (user?.name || '')) payload.name = name;
      if (email !== (user?.email || '')) payload.email = email;
      if (newPicBase64 !== null) payload.profilePic = newPicBase64;
      await api.put('/auth/profile', payload);
      toast.success('Profile updated successfully!');
      if (refreshUser) await refreshUser();
      setNewPicBase64(null);
    } catch (err) { toast.error(err.response?.data?.message || err.message || 'Failed to update profile.'); }
    finally { setSaving(false); }
  };

  const inputStyle = {
    width: '100%', padding: '14px 16px 14px 48px',
    background: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
    border: '1px solid var(--surface-border)', borderRadius: '12px',
    color: 'var(--text-primary)', fontSize: '0.95rem', outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  };

  const labelStyle = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'block' };

  const actionFormatMap = {
    LOGIN: '🔑 Login', LOGIN_FAILED: '❌ Login Failed', LOGOUT: '🚪 Logout', LOGOUT_ALL_DEVICES: '🔒 Logout All',
    REGISTER: '📝 Register', PASSWORD_CHANGE: '🔐 Password Changed', PASSWORD_RESET_REQUEST: '📧 Reset Requested',
    PASSWORD_RESET_COMPLETE: '✅ Password Reset', PROFILE_UPDATE: '👤 Profile Updated', EMAIL_VERIFIED: '✉️ Email Verified',
    PAYMENT_SUCCESS: '💳 Payment Success', PAYMENT_FAILED: '❌ Payment Failed', PRO_UPGRADE: '⭐ Pro Upgrade',
    WALLET_TOPUP: '💰 Wallet Top-up', WALLET_WITHDRAWAL: '💸 Withdrawal', SESSION_REVOKED: '🔐 Session Revoked'
  };

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Email Verification Banner */}
      {user && user.emailVerified === false && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertCircle size={18} color="#f59e0b" />
            <span style={{ color: '#f59e0b', fontSize: '0.88rem', fontWeight: 500 }}>Please verify your email address</span>
          </div>
          <button onClick={handleResendVerification} disabled={resendingVerification}
            style={{ background: 'rgba(245, 158, 11, 0.2)', border: 'none', padding: '6px 14px', borderRadius: '8px', color: '#f59e0b', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RefreshCw size={12} /> {resendingVerification ? 'Sending...' : 'Resend'}
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '12px', color: 'white' }}><User size={24} /></div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Profile</h1>
      </div>

      {/* Profile Picture Section */}
      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', background: 'var(--primary)', opacity: 0.08, filter: 'blur(40px)', borderRadius: '50%' }}></div>
        <div style={{ position: 'relative' }}>
          <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: previewPic ? `url(${previewPic}) center/cover no-repeat` : 'linear-gradient(135deg, var(--primary), #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: previewPic ? 0 : '3rem', fontWeight: 700, color: 'white', border: user?.isPro ? '3px solid #a78bfa' : '3px solid var(--surface-border)', boxShadow: user?.isPro ? '0 0 20px rgba(139, 92, 246, 0.3)' : '0 4px 20px rgba(0,0,0,0.15)', transition: 'all 0.3s ease' }}>
            {!previewPic && (user?.name?.charAt(0).toUpperCase() || 'U')}
          </div>
          <button onClick={() => fileInputRef.current?.click()} style={{ position: 'absolute', bottom: '0', right: '0', width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', border: '3px solid var(--bg-dark)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'transform 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
            <Camera size={16} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg" onChange={handleFileSelect} style={{ display: 'none' }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Upload a profile picture (JPEG/JPG only, max 2MB)</p>
          {previewPic && <button onClick={handleRemovePic} style={{ marginTop: '8px', background: 'transparent', border: 'none', color: 'var(--danger)', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><X size={14} /> Remove Photo</button>}
        </div>
        {picError && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#ef4444', fontSize: '0.82rem', width: '100%' }}><AlertCircle size={16} />{picError}</div>}
      </Card>

      {/* Name & Email */}
      <Card style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <div style={{ position: 'relative' }}>
            <User size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--surface-border)'; e.target.style.boxShadow = 'none'; }} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email Address</label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--surface-border)'; e.target.style.boxShadow = 'none'; }} />
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <button onClick={handleSave} disabled={!hasChanges || saving}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', width: '100%', padding: '14px', borderRadius: '12px', border: 'none', background: hasChanges ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99, 102, 241, 0.3)', color: 'white', fontSize: '1rem', fontWeight: 600, cursor: hasChanges && !saving ? 'pointer' : 'not-allowed', boxShadow: hasChanges ? '0 4px 15px rgba(99, 102, 241, 0.3)' : 'none', transition: 'all 0.3s ease', opacity: hasChanges ? 1 : 0.6 }}>
        {saving ? <><div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>Saving...</> : <><Save size={18} />Save Changes</>}
      </button>

      {/* Change Password */}
      <Card style={{ padding: '20px' }}>
        <button onClick={() => setShowChangePassword(!showChangePassword)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Lock size={18} color="var(--primary)" />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Change Password</span>
          </div>
          {showChangePassword ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showChangePassword && (
          <form onSubmit={handleChangePassword} style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input type="password" placeholder="Current Password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required style={{ width: '100%' }} />
            <input type="password" placeholder="New Password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} style={{ width: '100%' }} />
            <input type="password" placeholder="Confirm New Password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required style={{ width: '100%' }} />
            <button type="submit" className="btn" disabled={changingPassword} style={{ background: '#10b981' }}>
              {changingPassword ? 'Changing...' : 'Update Password'}
            </button>
          </form>
        )}
      </Card>

      {/* Active Sessions */}
      <Card style={{ padding: '20px' }}>
        <button onClick={() => { setShowSessions(!showSessions); if (!showSessions) fetchSessions(); }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Monitor size={18} color="var(--primary)" />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Active Sessions</span>
          </div>
          {showSessions ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showSessions && (
          <div style={{ marginTop: '16px' }}>
            {loadingSessions ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : sessions.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>No active sessions found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {sessions.map(session => (
                  <div key={session._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: session.isCurrent ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-darker)', borderRadius: '10px', border: session.isCurrent ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid var(--surface-border)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        <Monitor size={14} /> {session.device} • {session.browser}
                        {session.isCurrent && <span style={{ background: '#10b981', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600 }}>Current</span>}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        <Clock size={11} style={{ verticalAlign: 'middle' }} /> {new Date(session.loginAt).toLocaleString('en-IN')} • IP: {session.ip}
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <button onClick={() => handleRevokeSession(session._id)}
                        style={{ background: 'rgba(239, 68, 68, 0.12)', border: 'none', padding: '6px 10px', borderRadius: '6px', color: '#ef4444', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={handleLogoutAll}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px', fontSize: '0.88rem' }}>
                  <LogOut size={16} /> Logout from All Devices
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Audit Logs */}
      <Card style={{ padding: '20px' }}>
        <button onClick={() => { setShowAuditLogs(!showAuditLogs); if (!showAuditLogs) fetchAuditLogs(); }}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '4px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={18} color="var(--primary)" />
            <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Security Audit Log</span>
          </div>
          {showAuditLogs ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
        {showAuditLogs && (
          <div style={{ marginTop: '16px' }}>
            {loadingAuditLogs ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading...</div>
            ) : auditLogs.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>No audit logs found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                {auditLogs.map(log => (
                  <div key={log._id} style={{ padding: '10px 14px', background: 'var(--bg-darker)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {actionFormatMap[log.action] || log.action}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    {log.details && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{log.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Account Info */}
      <Card style={{ padding: '20px', opacity: 0.9 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Member Since</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Email Status</span>
            <span style={{ color: user?.emailVerified ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
              {user?.emailVerified ? '✓ Verified' : '⚠ Unverified'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Plan</span>
            <span style={{ color: (user?.plan === 'PRO' || user?.isPro) ? '#a78bfa' : 'var(--text-primary)', fontWeight: 600 }}>
              {(user?.plan === 'PRO' || user?.isPro) ? '✦ Pro Member' : 'Free Plan'}
            </span>
          </div>
          
          {(user?.plan === 'PRO' || user?.isPro) && user?.subscriptionEndDate && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span style={{ color: user?.subscriptionStatus === 'ACTIVE' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{user.subscriptionStatus}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Valid Until</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {new Date(user.subscriptionEndDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>
            </>
          )}

          {user?.plan !== 'PRO' && !user?.isPro && (
            <div style={{ marginTop: '12px' }}>
              <button onClick={handleSubscribe} disabled={processingPayment}
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #a855f7, #6366f1)', color: 'white', fontWeight: 600, cursor: processingPayment ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: processingPayment ? 0.7 : 1 }}>
                {processingPayment ? 'Processing...' : 'Upgrade to PRO (₹499/mo)'}
              </button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Profile;
