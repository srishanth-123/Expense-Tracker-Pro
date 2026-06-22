import { useState, useEffect, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Users, Plus, CheckCircle, Clock, X, Search, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import './Splits.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const Splits = () => {
  const { user } = useContext(AuthContext);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settlingId, setSettlingId] = useState(null);
  const [confirmSettle, setConfirmSettle] = useState({ isOpen: false, splitId: null, amount: 0 });
  const [confirmOffline, setConfirmOffline] = useState({ isOpen: false, splitId: null, participantUserId: null, email: null, share: 0 });
  const [settlingOffline, setSettlingOffline] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, splitId: null });
  const [deletingId, setDeletingId] = useState(null);
  
  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [participants, setParticipants] = useState([]); 
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [paidBy, setPaidBy] = useState('');
  
  // User Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Toggle Scroll Lock when any modal is open
  useEffect(() => {
    if (isModalOpen || confirmSettle.isOpen || confirmOffline.isOpen || confirmDelete.isOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isModalOpen, confirmSettle.isOpen, confirmOffline.isOpen, confirmDelete.isOpen]);

  const fetchSplits = async () => {
    try {
      const res = await api.get('/split/user');
      setSplits(Array.isArray(res) ? res : res.data || []);
    } catch {
      toast.error('Failed to load split expenses');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(Array.isArray(res) ? res : (res.data || res.categories || []));
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  const userId = user?._id;

  useEffect(() => {
    if (userId) {
      fetchSplits();
      fetchCategories();
    }
  }, [userId]);

  const updateTimer = useRef(null);
  useEffect(() => {
    const handleUpdate = () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(() => {
        if (userId) fetchSplits();
      }, 600);
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => {
      window.removeEventListener('financialDataUpdated', handleUpdate);
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, [userId]);

  // Handle User Search (Debounced & Instant Spinner)
  useEffect(() => {
    const queryTrimmed = searchQuery.trim();
    if (!queryTrimmed) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await api.get(`/auth/users?query=${encodeURIComponent(queryTrimmed)}`);
        setSearchResults(Array.isArray(res) ? res : res.data || []);
      } catch {
        // fail silently for search
      } finally {
        setSearching(false);
      }
    }, 300); // Snappy 300ms debounce delay

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const addParticipant = (selectedUser) => {
    if (participants.find(p => p.user._id === selectedUser._id)) {
      toast.error('User already added');
      return;
    }
    setParticipants([...participants, { user: selectedUser, share: 0 }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeParticipant = (userId) => {
    setParticipants(participants.filter(p => p.user._id !== userId));
    if (paidBy === userId) {
      setPaidBy(user._id);
    }
  };

  const toggleParticipantPaid = (userId, checked) => {
    setParticipants(participants.map(p => 
      p.user._id === userId ? { ...p, paid: checked } : p
    ));
  };

  const handleCreateSplit = async (e) => {
    e.preventDefault();
    if (!description || !amount || participants.length === 0) {
      toast.error('Please fill all required fields and add participants');
      return;
    }

    const totalAmount = parseFloat(amount);
    const creatorPayer = (paidBy || user._id) === user._id;
    const allParticipants = [
      { 
        user: user._id, 
        email: user.email, 
        name: user.name, 
        share: 0, 
        paid: creatorPayer 
      },
      ...participants.map(p => ({ 
        user: p.user._id, 
        email: p.user.email,
        name: p.user.name,
        share: 0,
        paid: p.user._id === paidBy ? true : Boolean(p.paid)
      }))
    ];

    try {
      setSubmitting(true);
      await api.post('/split/create', {
        amount: totalAmount,
        description,
        splitType: 'equal',
        category: selectedCategory || null,
        paidBy: paidBy || user._id,
        participants: allParticipants
      });
      toast.success('Split expense created successfully');
      setIsModalOpen(false);
      
      setDescription('');
      setAmount('');
      setParticipants([]);
      setSelectedCategory('');
      setPaidBy('');
      
      fetchSplits();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create split');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettleOffline = (splitId, participantUserId, email, share) => {
    setConfirmOffline({ isOpen: true, splitId, participantUserId, email, share });
  };

  const confirmSettleOffline = async () => {
    const { splitId, participantUserId, email } = confirmOffline;
    try {
      setSettlingOffline(true);
      await api.post('/split/settle-offline', { splitId, participantUserId, email });
      toast.success('Participant share marked settled offline');
      setConfirmOffline({ isOpen: false, splitId: null, participantUserId: null, email: null, share: 0 });
      fetchSplits();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to settle offline');
    } finally {
      setSettlingOffline(false);
    }
  };

  const handleDeleteSplit = (splitId) => {
    setConfirmDelete({ isOpen: true, splitId });
  };

  const confirmDeleteSplit = async () => {
    const { splitId } = confirmDelete;
    try {
      setDeletingId(splitId);
      await api.delete(`/split/${splitId}`);
      toast.success('Split deleted successfully');
      setConfirmDelete({ isOpen: false, splitId: null });
      fetchSplits();
    } catch (err) {
      console.error('Delete split error:', err);
      toast.error(err.response?.data?.message || 'Failed to delete split');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSettle = async (splitId, amount) => {
    if (confirmSettle.isOpen) return;
    setConfirmSettle({ isOpen: true, splitId, amount });
  };

  const confirmSettlement = async () => {
    const { splitId, amount } = confirmSettle;
    // Stable idempotency key: a split can only be settled once per user/split reference.
    const idempotencyKey = `settle_${splitId}`;
    setSettlingId(splitId);
    setConfirmSettle({ isOpen: false, splitId: null, amount: 0 });
    try {
      const response = await api.post('/split/settle', 
        { splitId }, 
        { headers: { 'x-idempotency-key': idempotencyKey } }
      );
      
      const receiverName = response?.receiverName || 'Friend';
      const formattedAmount = fmt(amount);
      
      toast.success(`Successfully sent ${formattedAmount} to ${receiverName}`, { 
        duration: 5000,
        style: {
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--success)',
        }
      });
      window.dispatchEvent(new CustomEvent('financialDataUpdated'));
      fetchSplits();
    } catch (err) {
      console.error('Settlement error:', err);
      toast.error(err.response?.data?.message || 'Settlement failed. Check wallet balance.', {
        duration: 5000,
        style: {
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--danger)',
        }
      });

    } finally {
      setSettlingId(null);
    }
  };

  const activeSplits = splits.filter(split => !split.participants.every(p => p.paid || p.status === 'unregistered'));
  const settledSplits = splits.filter(split => split.participants.every(p => p.paid || p.status === 'unregistered'));

  const renderSplitCard = (split) => {
    const isPaidByMe = split.paidBy._id === user._id;
    const myParticipantInfo = split.participants.find(p => p.user && p.user._id === user._id);
    const myShare = myParticipantInfo ? myParticipantInfo.share : 0;
    const amISettled = myParticipantInfo ? myParticipantInfo.paid : false;
    const allSettled = split.participants.every(p => p.paid || p.status === 'unregistered');

    return (
      <Card key={split._id} hoverEffect padding="20px" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="sp-card-header">
          <div>
            <h3 className="sp-card-desc">{split.description}</h3>
            {split.category && (
              <span style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 8px', borderRadius: '12px', fontWeight: 500, display: 'inline-block', marginTop: '4px' }}>
                {split.category.name}
              </span>
            )}
            <p className="sp-card-date" style={{ marginTop: '4px' }}>{new Date(split.createdAt).toLocaleDateString()}</p>
          </div>
          <div className={`sp-badge ${allSettled ? 'settled' : 'pending'}`}>
            {allSettled ? 'All Settled' : 'Pending'}
          </div>
        </div>

        <div className="sp-card-amount">{fmt(split.amount)}</div>

        <div className="sp-participants">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 500 }}>
            Paid by {isPaidByMe ? 'You' : split.paidBy.name}
          </div>
          {split.participants.map((p, idx) => {
            const isParticipantPayer = p.user && p.user._id === split.paidBy._id;
            const canSettleOffline = isPaidByMe && !isParticipantPayer && !p.paid;
            return (
              <div key={p.user ? `${p.user._id}-${idx}` : `pending-${idx}`} className="sp-participant-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className="sp-participant-name" style={{ flex: 1 }}>
                  {p.user ? (p.user._id === user._id ? 'You' : p.user.name) : p.name || p.email || 'Pending'}
                </span>
                <span className="sp-participant-share" style={{ marginRight: '8px' }}>{fmt(p.share)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {canSettleOffline && (
                    <button
                      type="button"
                      onClick={() => handleSettleOffline(split._id, p.user?._id || null, p.email, p.share)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--primary)',
                        color: 'var(--primary)',
                        borderRadius: '4px',
                        padding: '2px 8px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      className="settle-offline-btn"
                    >
                      Settle Offline
                    </button>
                  )}
                  <span className={`sp-participant-status ${p.paid ? 'settled' : 'pending'}`} style={{ color: p.paid ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center' }}>
                    {p.paid ? <CheckCircle size={14} /> : <Clock size={14} />}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        {!isPaidByMe && !amISettled && (
          <Button 
            fullWidth 
            style={{ marginTop: 'auto' }}
            onClick={() => handleSettle(split._id, myShare)}
            loading={settlingId === split._id}
          >
            Settle {fmt(myShare)}
          </Button>
        )}
        {isPaidByMe && (
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {!allSettled && (
              <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Waiting for others to settle
              </div>
            )}
            <button
              type="button"
              onClick={() => handleDeleteSplit(split._id)}
              className="tx-action-btn delete"
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: 'var(--danger)',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.2s'
              }}
            >
              <Trash2 size={14} /> Delete Split
            </button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="splits-page">
      <div className="sp-header">
        <h1 className="sp-title"><Users size={28} color="var(--primary)" /> Split Expenses</h1>
        <Button onClick={() => setIsModalOpen(true)} icon={Plus}>
          New Split
        </Button>
      </div>

      {loading ? (
        <SkeletonTheme baseColor="rgba(30, 41, 59, 0.5)" highlightColor="rgba(255, 255, 255, 0.05)">
          <div className="sp-grid">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} height={250} borderRadius={16} />)}
          </div>
        </SkeletonTheme>
      ) : splits.length === 0 ? (
        <EmptyState 
          icon={Users}
          title="No Split Expenses Yet"
          description="Create a split to share bills with friends and settle directly from your wallet."
          actionButton={<Button onClick={() => setIsModalOpen(true)}>Create Split</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Active Splits Section */}
          {activeSplits.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                Active Splits <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' }}>{activeSplits.length}</span>
              </h2>
              <div className="sp-grid">
                {activeSplits.map(renderSplitCard)}
              </div>
            </div>
          )}

          {activeSplits.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px dashed var(--surface-border)', borderRadius: '16px', background: 'rgba(255,255,255,0.01)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>No active splits. Everyone is fully settled up! 🎉</p>
            </div>
          )}

          {/* Settled History Section */}
          {settledSplits.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setShowHistory(!showHistory)}
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: '12px',
                  padding: '12px 20px',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={18} color="var(--success)" />
                  Settled History 
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '10px' }}>{settledSplits.length}</span>
                </span>
                <span style={{ transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  ▼
                </span>
              </button>

              {showHistory && (
                <div className="sp-grid" style={{ marginTop: '20px', animation: 'fadeIn 0.3s ease' }}>
                  {settledSplits.map(renderSplitCard)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Split Modal (Rendered via React Portal under document.body) */}
      {isModalOpen && createPortal(
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Split</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)} title="Cancel"><X size={24} /></button>
            </div>

            <form className="tx-form" onSubmit={handleCreateSplit}>
              <div>
                <label>Description</label>
                <input 
                  type="text" 
                  placeholder="Dinner, Cab, Movie..." 
                  required
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div>
                <label>Total Amount (₹)</label>
                <input 
                  type="number" 
                  min="1" 
                  required
                  placeholder="Total bill amount"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>

              <div>
                <label>Category</label>
                <select
                  required
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>Paid By</label>
                <select
                  value={paidBy || user._id}
                  onChange={e => setPaidBy(e.target.value)}
                >
                  <option value={user._id}>You</option>
                  {participants.filter(p => p.user && p.user._id).map(p => (
                    <option key={p.user._id} value={p.user._id}>{p.user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>Split With</label>
                <div style={{ position: 'relative' }}>
                  <div className="tx-search" style={{ marginBottom: '8px' }}>
                    <Search size={16} />
                    <input 
                      type="text" 
                      placeholder="Search friend by name or email..." 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  {/* Search Dropdown */}
                  {searchQuery.trim().length >= 1 && (
                    <div className="sp-search-results">
                      {searching ? (
                        <div className="sp-search-item" style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Searching...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="sp-search-item" style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>No users found</div>
                      ) : (
                        searchResults.map(su => (
                          <div key={su._id} className="sp-search-item" onClick={() => addParticipant(su)}>
                            <div className="sp-search-name">{su.name}</div>
                            <div className="sp-search-email">{su.email}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Selected Participants */}
                {participants.length > 0 && (
                  <div className="sp-participant-list">
                    {participants.map(p => (
                      <div key={p.user._id} className="sp-participant-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 500 }}>{p.user.name}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.user.email}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', cursor: 'pointer', margin: 0 }}>
                            <input 
                              type="checkbox" 
                              checked={p.paid || false} 
                              onChange={e => toggleParticipantPaid(p.user._id, e.target.checked)}
                              style={{ width: 'auto', margin: 0 }}
                            />
                            Already Paid
                          </label>
                          <button type="button" className="close-btn" onClick={() => removeParticipant(p.user._id)}>
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  The bill will be split equally between the payer and the selected participants.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" fullWidth loading={submitting}>
                  Create Split
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Settlement Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmSettle.isOpen}
        onClose={() => setConfirmSettle({ isOpen: false, splitId: null, amount: 0 })}
        onConfirm={confirmSettlement}
        title="Confirm Settlement"
        message={`Settle ${fmt(confirmSettle.amount)} from your wallet? This amount will be transferred to the person who paid the bill.`}
        confirmText="Confirm"
        isDanger={false}
        loading={settlingId === confirmSettle.splitId}
      />

      {/* Settle Offline Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmOffline.isOpen}
        onClose={() => !settlingOffline && setConfirmOffline({ isOpen: false, splitId: null, participantUserId: null, email: null, share: 0 })}
        onConfirm={confirmSettleOffline}
        title="Settle Offline"
        message={`Mark this share of ${fmt(confirmOffline.share)} as settled offline? Use this when the participant has paid you directly (cash/UPI) outside the app.`}
        confirmText="Confirm"
        isDanger={false}
        loading={settlingOffline}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDelete.isOpen}
        onClose={() => !deletingId && setConfirmDelete({ isOpen: false, splitId: null })}
        onConfirm={confirmDeleteSplit}
        title="Delete Split?"
        message="Are you sure you want to delete this split expense? This cannot be undone."
        confirmText="Delete"
        isDanger={true}
        loading={deletingId === confirmDelete.splitId}
      />
    </div>
  );
};

export default Splits;
