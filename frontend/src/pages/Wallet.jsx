import { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import { Wallet as WalletIcon, CreditCard, ArrowUpRight, ArrowDownRight, Clock, ShieldCheck, AlertCircle } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';

const AnimatedCounter = ({ value }) => {
  const { useSpring, useTransform } = require('framer-motion');
  const spring = useSpring(0, { mass: 1, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => 
    `₹${Math.round(current).toLocaleString('en-IN')}`
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
};

const Wallet = () => {
  const { user } = useContext(AuthContext);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [topupAmount, setTopupAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  const fetchWalletData = async () => {
    try {
      setLoading(true);
      const [balanceRes, historyRes] = await Promise.all([
        api.get('/wallet/balance'),
        api.get('/wallet/history')
      ]);
      setBalance(balanceRes.walletBalance ?? balanceRes.data?.walletBalance ?? 0);
      setHistory(Array.isArray(historyRes) ? historyRes : historyRes.data || []);
    } catch (err) {
      setError("Failed to load wallet data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchWalletData();
    }
  }, [user]);

  const handlePayment = async (e) => {
    e.preventDefault();
    if (!topupAmount || isNaN(topupAmount) || Number(topupAmount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      if (!window.Razorpay) {
        setError("Razorpay SDK failed to load. Please check your internet connection.");
        setProcessing(false);
        return;
      }

      const orderRes = await api.post('/payment/create-order', { amount: Number(topupAmount) });
      const { orderId, amount, currency, keyId } = orderRes.data || orderRes; // fallback for unwrapped vs non-unwrapped

      const options = {
        key: keyId, 
        amount: amount, 
        currency: currency,
        name: "ExpenseTracker",
        description: "Wallet Top-up",
        order_id: orderId,
        handler: async function (response) {
          try {
            setProcessing(true);
            await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            setSuccess(`Successfully added ₹${topupAmount} to your wallet!`);
            setTopupAmount('');
            fetchWalletData();
          } catch (verifyError) {
            setError("Payment verification failed. If money was deducted, please contact support.");
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          name: user.name || "User",
          email: user.email || "user@example.com",
        },
        theme: { color: "#6366f1" }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', function (response){
        setError(`Payment Failed: ${response.error.description}`);
        setProcessing(false);
      });
      rzp1.open();

    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to initialize payment gateway");
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <SkeletonTheme baseColor="rgba(30, 41, 59, 0.5)" highlightColor="rgba(255, 255, 255, 0.05)">
        <div style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
          <Skeleton height={40} width={200} style={{ marginBottom: '32px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
            <Skeleton height={220} borderRadius={16} />
            <Skeleton height={220} borderRadius={16} />
          </div>
          <Skeleton height={300} borderRadius={16} style={{ marginTop: '24px' }} />
        </div>
      </SkeletonTheme>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '12px', color: 'white' }}>
          <WalletIcon size={24} />
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Your Wallet</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
        
        {/* Balance Card */}
        <Card style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden', minHeight: '220px' }}>
          <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '150px', height: '150px', background: 'var(--primary)', opacity: 0.15, filter: 'blur(40px)', borderRadius: '50%' }}></div>
          
          <div>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} /> Available Balance
            </h3>
            <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '16px' }}>
              <AnimatedCounter value={balance} />
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
             <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
               <ShieldCheck size={14} color="var(--success)" /> Secure Razorpay Gateway
             </div>
          </div>
        </Card>

        {/* Top-Up Form Card */}
        <Card>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CreditCard size={18} color="var(--primary)" /> Top-up Wallet
          </h3>
          
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} /> {error}
            </motion.div>
          )}
          
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} /> {success}
            </motion.div>
          )}

          <form onSubmit={handlePayment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Amount (₹)</label>
              <input 
                type="number" 
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="Enter amount (e.g., 500)"
                min="1"
                required
                style={{ 
                  width: '100%', padding: '12px 16px', borderRadius: '8px', 
                  background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', 
                  color: 'white', fontSize: '1rem', outline: 'none'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              {[100, 500, 1000].map(amt => (
                <button 
                  key={amt} 
                  type="button"
                  onClick={() => setTopupAmount(amt.toString())}
                  style={{ 
                    flex: 1, padding: '8px', borderRadius: '6px', 
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
                    color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                >
                  +₹{amt}
                </button>
              ))}
            </div>

            <Button 
              type="submit" 
              loading={processing}
              fullWidth
            >
              Proceed to Pay
            </Button>
          </form>
        </Card>
      </div>

      {/* Transaction History */}
      <Card style={{ marginTop: '16px' }}>
        <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} /> Wallet History
        </h3>
        
        {history.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.map((txn, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: txn.type === 'credit' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    color: txn.type === 'credit' ? 'var(--success)' : 'var(--danger)'
                  }}>
                    {txn.type === 'credit' ? <ArrowDownRight size={20} /> : <ArrowUpRight size={20} />}
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {txn.type === 'credit' ? 'Top-up Received' : 'Payment Sent'}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                      {new Date(txn.createdAt).toLocaleString()} • Ref: {txn.referenceId || txn._id.substring(0,8)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: txn.type === 'credit' ? 'var(--success)' : 'var(--danger)' }}>
                  {txn.type === 'credit' ? '+' : '-'}₹{txn.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState 
            icon={Clock}
            title="No wallet history"
            description="Top up your wallet to get started with secure instant payments."
          />
        )}
      </Card>

    </div>
  );
};

export default Wallet;
