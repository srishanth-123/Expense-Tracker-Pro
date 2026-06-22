import { useState, useContext, useRef, useEffect } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Camera, User, Mail, Save, X, AlertCircle } from 'lucide-react';
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

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  const handleSubscribe = async () => {
    try {
      setProcessingPayment(true);
      if (!window.Razorpay) {
        toast.error("Razorpay SDK failed to load.");
        setProcessingPayment(false);
        return;
      }

      // Create subscription order (amount 499, purpose: subscription)
      const orderRes = await api.post('/payment/create-order', { amount: 499, purpose: 'subscription' });
      const { orderId, amount, currency, keyId } = orderRes.data?.data || orderRes.data;

      let paymentProcessed = false;

      const options = {
        key: keyId, 
        amount: amount, 
        currency: currency,
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
          } finally {
            setProcessingPayment(false);
          }
        },
        prefill: {
          name: user?.name || "User",
          email: user?.email || "",
        },
        theme: { color: "#8b5cf6" },
        modal: {
          ondismiss: async function() {
            setProcessingPayment(false);
            if (paymentProcessed) return;
            paymentProcessed = true;
            try {
              await api.post('/payment/fail', {
                razorpay_order_id: orderId,
                reason: "Payment cancelled by user"
              });
            } catch (failLogErr) {
              console.error("Failed to log subscription payment cancellation:", failLogErr);
            }
          }
        }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', async function (response){
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
        } catch (failLogErr) {
          console.error("Failed to log subscription payment failure:", failLogErr);
        }
      });
      rzp1.open();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to initialize payment");
      setProcessingPayment(false);
    }
  };

  const hasChanges = name !== (user?.name || '') || email !== (user?.email || '') || newPicBase64 !== null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPicError('');

    // Extension check
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg'].includes(ext)) {
      setPicError('Only .jpg or .jpeg files are allowed.');
      e.target.value = '';
      return;
    }

    // MIME type check
    if (file.type !== 'image/jpeg') {
      setPicError('Only JPEG/JPG images are allowed.');
      e.target.value = '';
      return;
    }

    // Size check (2MB)
    if (file.size > 2 * 1024 * 1024) {
      setPicError('Image must be less than 2MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      setPreviewPic(base64);
      setNewPicBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePic = () => {
    setPreviewPic('');
    setNewPicBase64('');
    setPicError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to update profile.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '14px 16px 14px 48px',
    background: theme === 'dark' ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
    border: '1px solid var(--surface-border)',
    borderRadius: '12px',
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  };

  const labelStyle = {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
    display: 'block'
  };

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '12px', color: 'white' }}>
          <User size={24} />
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Edit Profile</h1>
      </div>

      {/* Profile Picture Section */}
      <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '120px', height: '120px', background: 'var(--primary)', opacity: 0.08, filter: 'blur(40px)', borderRadius: '50%' }}></div>

        <div style={{ position: 'relative' }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: previewPic ? `url(${previewPic}) center/cover no-repeat` : 'linear-gradient(135deg, var(--primary), #a855f7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: previewPic ? 0 : '3rem',
            fontWeight: 700,
            color: 'white',
            border: user?.isPro ? '3px solid #a78bfa' : '3px solid var(--surface-border)',
            boxShadow: user?.isPro ? '0 0 20px rgba(139, 92, 246, 0.3)' : '0 4px 20px rgba(0,0,0,0.15)',
            transition: 'all 0.3s ease'
          }}>
            {!previewPic && (user?.name?.charAt(0).toUpperCase() || 'U')}
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              position: 'absolute',
              bottom: '0',
              right: '0',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'var(--primary)',
              border: '3px solid var(--bg-dark)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Camera size={16} />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Upload a profile picture (JPEG/JPG only, max 2MB)
          </p>
          {previewPic && (
            <button
              onClick={handleRemovePic}
              style={{
                marginTop: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--danger)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <X size={14} /> Remove Photo
            </button>
          )}
        </div>

        {picError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '0.82rem',
            width: '100%'
          }}>
            <AlertCircle size={16} />
            {picError}
          </div>
        )}
      </Card>

      {/* Name & Email */}
      <Card style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <label style={labelStyle}>Full Name</label>
          <div style={{ position: 'relative' }}>
            <User size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--surface-border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Email Address</label>
          <div style={{ position: 'relative' }}>
            <Mail size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--surface-border)'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={!hasChanges || saving}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          width: '100%',
          padding: '14px',
          borderRadius: '12px',
          border: 'none',
          background: hasChanges ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(99, 102, 241, 0.3)',
          color: 'white',
          fontSize: '1rem',
          fontWeight: 600,
          cursor: hasChanges && !saving ? 'pointer' : 'not-allowed',
          boxShadow: hasChanges ? '0 4px 15px rgba(99, 102, 241, 0.3)' : 'none',
          transition: 'all 0.3s ease',
          opacity: hasChanges ? 1 : 0.6
        }}
      >
        {saving ? (
          <>
            <div style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
            Saving...
          </>
        ) : (
          <>
            <Save size={18} />
            Save Changes
          </>
        )}
      </button>

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
            <span style={{ color: 'var(--text-secondary)' }}>Plan</span>
            <span style={{ color: (user?.plan === 'PRO' || user?.isPro) ? '#a78bfa' : 'var(--text-primary)', fontWeight: 600 }}>
              {(user?.plan === 'PRO' || user?.isPro) ? '✦ Pro Member' : 'Free Plan'}
            </span>
          </div>
          
          {(user?.plan === 'PRO' || user?.isPro) && user?.subscriptionEndDate && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Status</span>
                <span style={{ color: user?.subscriptionStatus === 'ACTIVE' ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                  {user.subscriptionStatus}
                </span>
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
              <button
                onClick={handleSubscribe}
                disabled={processingPayment}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
                  color: 'white',
                  fontWeight: 600,
                  cursor: processingPayment ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: processingPayment ? 0.7 : 1
                }}
              >
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
