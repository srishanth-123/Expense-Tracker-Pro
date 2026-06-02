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

import { useSpring, useTransform } from 'framer-motion';

const AnimatedCounter = ({ value }) => {
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
  const { user, refreshUser } = useContext(AuthContext);
  const [balance, setBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [topupAmount, setTopupAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Withdrawal feature states
  const [activeTab, setActiveTab] = useState('topup'); // 'topup' or 'withdraw'
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawUpi, setWithdrawUpi] = useState('');

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
        api.get(`/wallet/history?page=${page}&limit=20`)
      ]);
      const balance = balanceRes.data?.walletBalance ?? balanceRes.walletBalance ?? 0;
      setBalance(balance);
      const historyData = historyRes.data || historyRes;
      setHistory(Array.isArray(historyData) ? historyData : historyData.transactions || []);
      setTotalPages(historyData.pages || 1);
      setTotalItems(historyData.total || 0);
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
  }, [user, page]);

  useEffect(() => {
    const handleUpdate = () => {
      if (user) fetchWalletData();
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => window.removeEventListener('financialDataUpdated', handleUpdate);
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
            refreshUser();
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

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  };

  const handleWithdrawal = async (e) => {
    e.preventDefault();
    if (!withdrawAmount || isNaN(withdrawAmount) || Number(withdrawAmount) < 100) {
      setError("Minimum withdrawal amount is ₹100.");
      return;
    }
    if (!withdrawUpi || !withdrawUpi.trim()) {
      setError("Please enter a valid UPI ID.");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      const res = await api.post('/wallet/withdraw', {
        amount: Number(withdrawAmount),
        upiId: withdrawUpi.trim()
      });

      const responseData = res.data || res;
      setSuccess(responseData.message || `Successfully withdrew ₹${withdrawAmount}!`);
      setWithdrawAmount('');
      setWithdrawUpi('');
      refreshUser();
      fetchWalletData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to process withdrawal.");
    } finally {
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

        {/* Top-Up / Withdraw Card */}
        <Card>
          {/* Tab Selector */}
          <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', marginBottom: '20px' }}>
            <button
              onClick={() => handleTabChange('topup')}
              style={{
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'topup' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'topup' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <CreditCard size={16} /> Top-up
            </button>
            <button
              onClick={() => handleTabChange('withdraw')}
              style={{
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'withdraw' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'withdraw' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <ArrowUpRight size={16} /> Withdraw
            </button>
          </div>
          
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

          {activeTab === 'topup' && (
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
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                  }}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                {[100, 500, 1000].map(amt => (
                  <button 
                    key={amt} 
                    type="button"
                    onClick={() => setTopupAmount((prev) => (Number(prev) + amt).toString())}
                    style={{ 
                      flex: 1, padding: '8px', borderRadius: '6px', 
                      background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                      color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--input-bg)'; e.currentTarget.style.borderColor = 'var(--input-border)'; }}
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
          )}

          {activeTab === 'withdraw' && (
            <form onSubmit={handleWithdrawal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Amount to Withdraw (₹)</label>
                <input 
                  type="number" 
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Enter amount (Min ₹100)"
                  min="100"
                  required
                  style={{ 
                    width: '100%', padding: '12px 16px', borderRadius: '8px', 
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>UPI ID (for Payout)</label>
                <input 
                  type="text" 
                  value={withdrawUpi}
                  onChange={(e) => setWithdrawUpi(e.target.value)}
                  placeholder="e.g., user@okhdfcbank"
                  required
                  style={{ 
                    width: '100%', padding: '12px 16px', borderRadius: '8px', 
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                  }}
                />
              </div>

              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontWeight: 600 }}>Note:</span>
                <span>• Minimum withdrawal: ₹100</span>
                <span>• Payouts &gt; ₹10,000 will trigger a demo Saga rollback failure.</span>
              </div>

              <Button 
                type="submit" 
                loading={processing}
                fullWidth
              >
                Proceed to Withdraw
              </Button>
            </form>
          )}
        </Card>
      </div>

      {/* Transaction History */}
      <Card style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} /> Wallet History
          </h3>
          {totalItems > 0 && (
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {totalItems} transactions
            </span>
          )}
        </div>
        
        {history.length > 0 ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {history.map((txn) => (
                <div key={txn._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                        {txn.description || (txn.type === 'credit' ? 'Top-up Received' : 'Payment Sent')}
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                        {new Date(txn.createdAt).toLocaleString()} • {txn.source}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 600, color: txn.type === 'credit' ? 'var(--success)' : 'var(--danger)' }}>
                    {txn.type === 'credit' ? '+' : '-'}₹{txn.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: page === 1 ? 'var(--input-bg)' : 'var(--primary)',
                    color: page === 1 ? 'var(--text-secondary)' : 'white',
                    border: 'none',
                    cursor: page === 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Previous
                </button>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: page === totalPages ? 'var(--input-bg)' : 'var(--primary)',
                    color: page === totalPages ? 'var(--text-secondary)' : 'white',
                    border: 'none',
                    cursor: page === totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
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
