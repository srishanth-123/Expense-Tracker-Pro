import { useState, useEffect, useContext, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import toast from 'react-hot-toast';
import { Wallet as WalletIcon, CreditCard, ArrowUpRight, ArrowDownRight, Clock, ShieldCheck, AlertCircle, Send, Search, User as UserIcon, Inbox, Check, X, Download } from 'lucide-react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';

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
  const { user } = useContext(AuthContext);
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    type: 'all',
    dateRange: '30days',
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: '',
    counterparty: '',
    status: 'all',
    format: 'csv'
  });
  
  // Withdrawal feature states
  const [activeTab, setActiveTab] = useState('topup'); // 'topup', 'withdraw', 'transfer'
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawUpi, setWithdrawUpi] = useState('');

  // Transfer feature states
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDesc, setTransferDesc] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

  // Requests feature states
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [requestTab, setRequestTab] = useState('new'); // 'new', 'inbox'
  const [reqAmount, setReqAmount] = useState('');
  const [reqNotes, setReqNotes] = useState('');

  // Confirmation modal states
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [showRequestConfirm, setShowRequestConfirm] = useState(false);
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);

  // Idempotency states
  const [transferIdempotencyKey, setTransferIdempotencyKey] = useState('');
  const [requestIdempotencyKey, setRequestIdempotencyKey] = useState('');

  const generateIdempotencyKeys = () => {
    const uuid = () => 'key_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
    setTransferIdempotencyKey(uuid());
    setRequestIdempotencyKey(uuid());
  };

  useEffect(() => {
    generateIdempotencyKeys();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 1 && !selectedUser) {
        try {
          const res = await api.get(`/wallet/users/search?query=${encodeURIComponent(searchQuery)}`);
          // API interceptor unwraps {success, data} → data (the array directly)
          setSearchResults(Array.isArray(res) ? res : (res?.data || []));
        } catch {
          console.error("Search failed");
        }
      } else {
        setSearchResults([]);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, selectedUser]);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  const fetchWalletData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [balanceRes, historyRes, requestsRes] = await Promise.all([
        api.get('/wallet/balance'),
        api.get(`/wallet/history?page=${page}&limit=20`),
        api.get('/money-requests')
      ]);
      // API interceptor unwraps {success, data} → data
      // balanceRes IS {walletBalance: N}
      setBalance(balanceRes?.walletBalance ?? 0);

      // historyRes IS {transactions: [...], pages, total, ...}
      const historyData = historyRes || {};
      setHistory(Array.isArray(historyData) ? historyData : (historyData.transactions || []));
      setTotalPages(historyData.pages || 1);
      setTotalItems(historyData.total || 0);

      // requestsRes IS {incoming: [...], outgoing: [...]}
      const reqData = requestsRes || {};
      setIncomingRequests(reqData.incoming || []);
      setOutgoingRequests(reqData.outgoing || []);
    } catch {
      setError("Failed to load wallet data. Please try again.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handleExportStatement = async (e) => {
    if (e) e.preventDefault();
    try {
      setProcessing(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams();
      params.append('format', exportFilters.format);
      params.append('type', exportFilters.type);
      params.append('dateRange', exportFilters.dateRange);
      if (exportFilters.dateRange === 'custom') {
        if (exportFilters.startDate) params.append('startDate', exportFilters.startDate);
        if (exportFilters.endDate) params.append('endDate', exportFilters.endDate);
      }
      if (exportFilters.minAmount) params.append('minAmount', exportFilters.minAmount);
      if (exportFilters.maxAmount) params.append('maxAmount', exportFilters.maxAmount);
      if (exportFilters.counterparty) params.append('counterparty', exportFilters.counterparty);
      if (exportFilters.status) params.append('status', exportFilters.status);

      const downloadUrl = `/wallet/export?${params.toString()}`;
      
      // Use raw axios to bypass the response interceptor for blob downloads
      const res = await api.get(downloadUrl, { responseType: 'blob' });
      
      // Handle blob response based on format
      const mimeType = exportFilters.format === 'pdf' ? 'application/pdf' : 'text/csv';
      const fileExt = exportFilters.format === 'pdf' ? 'pdf' : 'csv';
      
      const blobData = res instanceof Blob ? res : (res.data instanceof Blob ? res.data : new Blob([res.data || res], { type: mimeType }));
      const url = window.URL.createObjectURL(blobData);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wallet_statement_${new Date().toISOString().split('T')[0]}.${fileExt}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      setIsExportModalOpen(false);
    } catch {
      setError("Failed to export statement.");
    } finally {
      setProcessing(false);
    }
  };

  // Use user._id (stable string) instead of user (new object ref on every refresh)
  const userId = user?._id;

  useEffect(() => {
    if (userId) {
      fetchWalletData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, page]);

  // Debounced listener for cross-page updates (e.g. socket notifications)
  const updateTimer = useRef(null);
  useEffect(() => {
    const handleUpdate = () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(() => {
        if (userId) fetchWalletData(true);
      }, 600);
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => {
      window.removeEventListener('financialDataUpdated', handleUpdate);
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handlePayment = async (e) => {
    e.preventDefault();
    if (processing) return;
    if (!topupAmount || isNaN(topupAmount) || Number(topupAmount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      if (!window.Razorpay) {
        const errMsg = "Razorpay SDK failed to load. Please check your internet connection.";
        setError(errMsg);
        toast.error("Razorpay SDK failed to load.");
        setProcessing(false);
        return;
      }

      const orderRes = await api.post('/payment/create-order', { amount: Number(topupAmount) });
      const { orderId, amount, currency, keyId } = orderRes.data || orderRes; // fallback for unwrapped vs non-unwrapped

      let paymentProcessed = false;

      const options = {
        key: keyId, 
        amount: amount, 
        currency: currency,
        name: "ExpenseTracker",
        description: "Wallet Top-up",
        order_id: orderId,
        handler: async function (response) {
          paymentProcessed = true;
          try {
            setProcessing(true);
            toast.loading("Verifying payment...");
            await api.post('/payment/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            toast.dismiss();
            toast.success(`Successfully added ₹${topupAmount} to your wallet!`);
            setSuccess(`Successfully added ₹${topupAmount} to your wallet!`);
            setTopupAmount('');
            fetchWalletData();
          } catch (verifyError) {
            toast.dismiss();
            const errMsg = verifyError.response?.data?.message || "Payment verification failed. If money was deducted, please contact support.";
            setError(errMsg);
            toast.error(errMsg);
          } finally {
            setProcessing(false);
          }
        },
        prefill: {
          name: user.name || "User",
          email: user.email || "user@example.com",
        },
        theme: { color: "#6366f1" },
        modal: {
          ondismiss: async function () {
            setProcessing(false);
            if (paymentProcessed) return;
            paymentProcessed = true;
            toast.error("Payment cancelled.");
            try {
              await api.post('/payment/fail', {
                razorpay_order_id: orderId,
                reason: "Payment cancelled by user"
              });
              fetchWalletData();
            } catch (failLogErr) {
              console.error("Failed to log payment cancellation:", failLogErr);
            }
          }
        }
      };

      const rzp1 = new window.Razorpay(options);
      rzp1.on('payment.failed', async function (response){
        if (paymentProcessed) return;
        paymentProcessed = true;
        const errMsg = response.error?.description || "Payment failed";
        setError(`Payment Failed: ${errMsg}`);
        toast.error(`Payment Failed: ${errMsg}`);
        setProcessing(false);
        try {
          await api.post('/payment/fail', {
            razorpay_order_id: response.error?.metadata?.order_id || orderId,
            razorpay_payment_id: response.error?.metadata?.payment_id,
            reason: errMsg
          });
          fetchWalletData();
        } catch (failLogErr) {
          console.error("Failed to log payment failure:", failLogErr);
        }
      });
      rzp1.open();

    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || "Failed to initialize payment gateway";
      setError(errMsg);
      toast.error(errMsg);
      setProcessing(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
    // Clear shared user selection state to prevent leaking between Send/Request tabs
    setSelectedUser(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  const onWithdrawSubmit = (e) => {
    e.preventDefault();
    if (!withdrawAmount || isNaN(withdrawAmount) || Number(withdrawAmount) < 100) {
      setError("Minimum withdrawal amount is ₹100.");
      return;
    }
    if (!withdrawUpi || !withdrawUpi.trim()) {
      setError("Please enter a valid UPI ID.");
      return;
    }
    setError(null);
    setShowWithdrawConfirm(true);
  };

  const handleWithdrawal = async () => {
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
      setShowWithdrawConfirm(false);
      fetchWalletData();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to process withdrawal.");
      setShowWithdrawConfirm(false);
    } finally {
      setProcessing(false);
    }
  };

  const onTransferSubmit = (e) => {
    e.preventDefault();
    if (!selectedUser) {
      setError("Please select a user to transfer to.");
      return;
    }
    if (!transferAmount || isNaN(transferAmount) || Number(transferAmount) <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    setError(null);
    setShowSendConfirm(true);
  };

  const handleTransfer = async () => {
    try {
      setError(null);
      setSuccess(null);
      setProcessing(true);

      await api.post('/wallet/transfer', {
        receiverId: selectedUser._id,
        amount: Number(transferAmount),
        description: transferDesc
      }, {
        headers: {
          'x-idempotency-key': transferIdempotencyKey
        }
      });

      setSuccess(`Successfully sent ₹${transferAmount} to ${selectedUser.name}!`);
      setTransferAmount('');
      setTransferDesc('');
      setSelectedUser(null);
      setSearchQuery('');
      generateIdempotencyKeys();
      setShowSendConfirm(false);
      fetchWalletData();
    } catch (err) {
      setError(err.response?.data?.message || "Transfer failed.");
      setShowSendConfirm(false);
    } finally {
      setProcessing(false);
    }
  };

  const onRequestSubmit = (e) => {
    e.preventDefault();
    if (!selectedUser) return setError("Please select a user to request from.");
    if (!reqAmount || Number(reqAmount) <= 0) return setError("Invalid amount.");
    setError(null);
    setShowRequestConfirm(true);
  };

  const handleCreateRequest = async () => {
    try {
      setError(null); setSuccess(null); setProcessing(true);
      await api.post('/money-requests', {
        payerId: selectedUser._id,
        amount: Number(reqAmount),
        notes: reqNotes
      }, {
        headers: {
          'x-idempotency-key': requestIdempotencyKey
        }
      });
      setSuccess(`Money request sent to ${selectedUser.name}.`);
      setReqAmount(''); setReqNotes(''); setSelectedUser(null); setSearchQuery('');
      generateIdempotencyKeys();
      setShowRequestConfirm(false);
      fetchWalletData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to send request.");
      setShowRequestConfirm(false);
    } finally {
      setProcessing(false);
    }
  };

  const handleAcceptRequest = async (id) => {
    try {
      setProcessing(true); setError(null); setSuccess(null);
      await api.post(`/money-requests/${id}/accept`, {}, {
        headers: {
          'x-idempotency-key': `accept:${id}`
        }
      });
      setSuccess("Request accepted. Money transferred.");
      fetchWalletData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to accept request.");
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRequest = async (id) => {
    try {
      setProcessing(true); setError(null); setSuccess(null);
      await api.post(`/money-requests/${id}/reject`, {}, {
        headers: {
          'x-idempotency-key': `reject:${id}`
        }
      });
      setSuccess("Request declined.");
      fetchWalletData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to decline request.");
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
              onClick={() => handleTabChange('transfer')}
              style={{
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'transfer' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'transfer' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Send size={16} /> Send
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
            <button
              onClick={() => handleTabChange('requests')}
              style={{
                flex: 1,
                padding: '12px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'requests' ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === 'requests' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                position: 'relative'
              }}
            >
              <Inbox size={16} /> Requests
              {incomingRequests.length > 0 && (
                <span style={{ position: 'absolute', top: '8px', right: '10px', background: 'var(--danger)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                  {incomingRequests.length}
                </span>
              )}
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
            <form onSubmit={onWithdrawSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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

          {activeTab === 'transfer' && (
            <form onSubmit={onTransferSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Send To</label>
                {!selectedUser ? (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Search size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-secondary)' }} />
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by email or name..."
                        style={{ 
                          width: '100%', padding: '12px 16px 12px 40px', borderRadius: '8px', 
                          background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                          color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                        }}
                      />
                    </div>
                    {searchResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-dark)', border: '1px solid var(--surface-border)', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        {searchResults.map(u => (
                          <div 
                            key={u._id} 
                            onClick={() => { setSelectedUser(u); setSearchQuery(''); setSearchResults([]); }}
                            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-border)', transition: 'background 0.2s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                              {u.profilePicture ? <img src={u.profilePicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={16} />}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{u.name}</div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{u.email}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                        {selectedUser.profilePicture ? <img src={selectedUser.profilePicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{selectedUser.name}</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{selectedUser.email}</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setSelectedUser(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Change</button>
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Amount (₹)</label>
                <input 
                  type="number" 
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(e.target.value)}
                  placeholder="Enter amount"
                  min="1"
                  required
                  style={{ 
                    width: '100%', padding: '12px 16px', borderRadius: '8px', 
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Description (Optional)</label>
                <input 
                  type="text" 
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  placeholder="What's this for?"
                  style={{ 
                    width: '100%', padding: '12px 16px', borderRadius: '8px', 
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                  }}
                />
              </div>

              <Button 
                type="submit" 
                loading={processing}
                disabled={!selectedUser}
                fullWidth
              >
                Send Money securely
              </Button>
            </form>
          )}

          {activeTab === 'requests' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
                <button
                  onClick={() => setRequestTab('new')}
                  style={{
                    flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                    background: requestTab === 'new' ? 'var(--primary)' : 'transparent',
                    color: requestTab === 'new' ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  New Request
                </button>
                <button
                  onClick={() => setRequestTab('inbox')}
                  style={{
                    flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
                    background: requestTab === 'inbox' ? 'var(--primary)' : 'transparent',
                    color: requestTab === 'inbox' ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  Inbox {incomingRequests.length > 0 && `(${incomingRequests.length})`}
                </button>
              </div>

              {requestTab === 'new' && (
                <form onSubmit={onRequestSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Request From</label>
                    {!selectedUser ? (
                      <>
                        <div style={{ position: 'relative' }}>
                          <Search size={18} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-secondary)' }} />
                          <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by email or name..."
                            style={{ 
                              width: '100%', padding: '12px 16px 12px 40px', borderRadius: '8px', 
                              background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                              color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                            }}
                          />
                        </div>
                        {searchResults.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-dark)', border: '1px solid var(--surface-border)', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                            {searchResults.map(u => (
                              <div 
                                key={u._id} 
                                onClick={() => { setSelectedUser(u); setSearchQuery(''); setSearchResults([]); }}
                                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid var(--surface-border)', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                  {u.profilePicture ? <img src={u.profilePicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={16} />}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{u.name}</div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{u.email}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--primary)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            {selectedUser.profilePicture ? <img src={selectedUser.profilePicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={16} />}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{selectedUser.name}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{selectedUser.email}</div>
                          </div>
                        </div>
                        <button type="button" onClick={() => setSelectedUser(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Change</button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Amount (₹)</label>
                    <input 
                      type="number" 
                      value={reqAmount}
                      onChange={(e) => setReqAmount(e.target.value)}
                      placeholder="Enter amount"
                      min="1"
                      required
                      style={{ 
                        width: '100%', padding: '12px 16px', borderRadius: '8px', 
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                        color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Notes (Optional)</label>
                    <input 
                      type="text" 
                      value={reqNotes}
                      onChange={(e) => setReqNotes(e.target.value)}
                      placeholder="e.g. Dinner share"
                      style={{ 
                        width: '100%', padding: '12px 16px', borderRadius: '8px', 
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)', 
                        color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                      }}
                    />
                  </div>

                  <Button 
                    type="submit" 
                    loading={processing}
                    disabled={!selectedUser}
                    fullWidth
                  >
                    Send Request
                  </Button>
                </form>
              )}

              {requestTab === 'inbox' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {incomingRequests.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Incoming Requests</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {incomingRequests.map(req => (
                          <div key={req._id} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                  {req.requester?.profilePicture ? <img src={req.requester.profilePicture} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : <UserIcon size={20} />}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.requester?.name}</div>
                                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>requests ₹{req.amount}</div>
                                  {req.notes && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '4px', fontStyle: 'italic' }}>"{req.notes}"</div>}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => handleAcceptRequest(req._id)}
                                disabled={processing}
                                style={{ flex: 1, padding: '8px', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600 }}
                              >
                                <Check size={16} /> Pay ₹{req.amount}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req._id)}
                                disabled={processing}
                                style={{ flex: 1, padding: '8px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--input-border)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600 }}
                              >
                                <X size={16} /> Decline
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {outgoingRequests.length > 0 && (
                    <div>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sent Requests (Pending)</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {outgoingRequests.map(req => (
                          <div key={req._id} style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                <Clock size={16} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem' }}>To: {req.payer?.name}</div>
                                {req.notes && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{req.notes}</div>}
                              </div>
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{req.amount}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Inbox size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                      <p>You have no pending requests.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Transaction History */}
      <Card style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} /> Wallet History
            </h3>
            {totalItems > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'block' }}>
                {totalItems} transactions
              </span>
            )}
          </div>
          <button
            onClick={() => setIsExportModalOpen(true)}
            disabled={totalItems === 0}
            style={{
              padding: '8px 12px', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '6px', cursor: (totalItems === 0) ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: '0.85rem', opacity: (totalItems === 0) ? 0.7 : 1
            }}
          >
            <Download size={16} /> Export Statement
          </button>
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

      {isExportModalOpen && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !processing && setIsExportModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h2>Smart Wallet Statement</h2>
              <button className="close-btn" onClick={() => setIsExportModalOpen(false)} disabled={processing}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleExportStatement} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Type Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Transaction Type</label>
                <select
                  value={exportFilters.type}
                  onChange={(e) => setExportFilters({ ...exportFilters, type: e.target.value })}
                  style={{
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                    color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                  }}
                >
                  <option value="all">All</option>
                  <option value="topups">Wallet Top-Ups</option>
                  <option value="sent">Money Sent</option>
                  <option value="received">Money Received</option>
                  <option value="splits">Split Settlements</option>
                  <option value="withdrawals">Withdrawals</option>
                  <option value="transfers">Wallet Transfers</option>
                </select>
              </div>

              {/* Date Range Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Date Range</label>
                <select
                  value={exportFilters.dateRange}
                  onChange={(e) => setExportFilters({ ...exportFilters, dateRange: e.target.value })}
                  style={{
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                    color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                  }}
                >
                  <option value="7days">Last 7 Days</option>
                  <option value="30days">Last 30 Days</option>
                  <option value="3months">Last 3 Months</option>
                  <option value="6months">Last 6 Months</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Custom Dates (Conditional) */}
              {exportFilters.dateRange === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Start Date</label>
                    <input
                      type="date"
                      value={exportFilters.startDate}
                      onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })}
                      required={exportFilters.dateRange === 'custom'}
                      style={{
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                        color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>End Date</label>
                    <input
                      type="date"
                      value={exportFilters.endDate}
                      onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })}
                      required={exportFilters.dateRange === 'custom'}
                      style={{
                        background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                        color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Amount Range Filters */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Min Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Min"
                    value={exportFilters.minAmount}
                    onChange={(e) => setExportFilters({ ...exportFilters, minAmount: e.target.value })}
                    style={{
                      background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                      color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Max Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Max"
                    value={exportFilters.maxAmount}
                    onChange={(e) => setExportFilters({ ...exportFilters, maxAmount: e.target.value })}
                    style={{
                      background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                      color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Counterparty Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Counterparty Name/Email</label>
                <input
                  type="text"
                  placeholder="e.g. John, test@test.com"
                  value={exportFilters.counterparty}
                  onChange={(e) => setExportFilters({ ...exportFilters, counterparty: e.target.value })}
                  style={{
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                    color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                  }}
                />
              </div>

              {/* Transaction Status Filter */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Transaction Status</label>
                <select
                  value={exportFilters.status}
                  onChange={(e) => setExportFilters({ ...exportFilters, status: e.target.value })}
                  style={{
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px',
                    color: 'var(--text-primary)', width: '100%', padding: '10px 14px', fontSize: '0.9rem', outline: 'none'
                  }}
                >
                  <option value="all">All</option>
                  <option value="success">Success</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* Export Format */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Format</label>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="format"
                      value="csv"
                      checked={exportFilters.format === 'csv'}
                      onChange={() => setExportFilters({ ...exportFilters, format: 'csv' })}
                      style={{ cursor: 'pointer' }}
                    />
                    CSV
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    <input
                      type="radio"
                      name="format"
                      value="pdf"
                      checked={exportFilters.format === 'pdf'}
                      onChange={() => setExportFilters({ ...exportFilters, format: 'pdf' })}
                      style={{ cursor: 'pointer' }}
                    />
                    PDF
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <Button variant="secondary" type="button" onClick={() => setIsExportModalOpen(false)} disabled={processing}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" loading={processing}>
                  Export Statement
                </Button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ─── Confirmation Modals ─── */}
      <ConfirmModal
        isOpen={showSendConfirm}
        onClose={() => setShowSendConfirm(false)}
        onConfirm={handleTransfer}
        title="Confirm Money Transfer"
        message="Please review the transfer details below."
        confirmText={`Send ₹${Number(transferAmount).toLocaleString('en-IN')}`}
        cancelText="Cancel"
        isDanger={false}
        loading={processing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Recipient</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{selectedUser?.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email</span>
            <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{selectedUser?.email}</span>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Amount</span>
            <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.15rem' }}>₹{Number(transferAmount).toLocaleString('en-IN')}</span>
          </div>
          {transferDesc && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Description</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontStyle: 'italic' }}>"{transferDesc}"</span>
            </div>
          )}
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={showRequestConfirm}
        onClose={() => setShowRequestConfirm(false)}
        onConfirm={handleCreateRequest}
        title="Confirm Money Request"
        message="You are about to send a money request."
        confirmText="Send Request"
        cancelText="Cancel"
        isDanger={false}
        loading={processing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Request From</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{selectedUser?.name}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Email</span>
            <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{selectedUser?.email}</span>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Amount</span>
            <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '1.15rem' }}>₹{Number(reqAmount).toLocaleString('en-IN')}</span>
          </div>
          {reqNotes && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Notes</span>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontStyle: 'italic' }}>"{reqNotes}"</span>
            </div>
          )}
        </div>
      </ConfirmModal>

      <ConfirmModal
        isOpen={showWithdrawConfirm}
        onClose={() => setShowWithdrawConfirm(false)}
        onConfirm={handleWithdrawal}
        title="Confirm Withdrawal"
        message="Please review your withdrawal details. This action will deduct funds from your wallet."
        confirmText={`Withdraw ₹${Number(withdrawAmount).toLocaleString('en-IN')}`}
        cancelText="Cancel"
        isDanger={true}
        loading={processing}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Amount</span>
            <span style={{ fontWeight: 700, color: 'var(--danger)', fontSize: '1.15rem' }}>₹{Number(withdrawAmount).toLocaleString('en-IN')}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>UPI ID</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{withdrawUpi}</span>
          </div>
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.15)' }}>
            <AlertCircle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>Funds will be sent to the UPI ID above. Please verify it is correct.</span>
          </div>
        </div>
      </ConfirmModal>

    </div>
  );
};

export default Wallet;
