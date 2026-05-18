import { useState, useEffect, useContext } from 'react';
import { Users, Plus, CheckCircle, Clock, X, Search } from 'lucide-react';
import { toast } from 'react-hot-toast';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import './Splits.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const Splits = () => {
  const { user } = useContext(AuthContext);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settlingId, setSettlingId] = useState(null);
  
  // Form State
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [participants, setParticipants] = useState([]); 
  
  // User Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const fetchSplits = async () => {
    try {
      const res = await api.get('/split/user');
      setSplits(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      toast.error('Failed to load split expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSplits();
  }, []);

  // Handle User Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await api.get(`/auth/users?query=${searchQuery}`);
        setSearchResults(Array.isArray(res) ? res : res.data || []);
      } catch (err) {
        // fail silently for search
      } finally {
        setSearching(false);
      }
    }, 500);

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
  };

  const handleCreateSplit = async (e) => {
    e.preventDefault();
    if (!description || !amount || participants.length === 0) {
      toast.error('Please fill all required fields and add participants');
      return;
    }

    const totalAmount = parseFloat(amount);
    const allParticipants = [
      { user: user._id, share: 0 },
      ...participants.map(p => ({ user: p.user._id, share: 0 }))
    ];

    try {
      setSubmitting(true);
      await api.post('/split/create', {
        amount: totalAmount,
        description,
        splitType: 'equal',
        participants: allParticipants
      });
      toast.success('Split expense created successfully');
      setIsModalOpen(false);
      
      setDescription('');
      setAmount('');
      setParticipants([]);
      
      fetchSplits();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create split');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSettle = async (splitId) => {
    const idempotencyKey = `settle_${splitId}_${Date.now()}`;
    setSettlingId(splitId);
    try {
      await api.post('/split/settle', 
        { splitId }, 
        { headers: { 'x-idempotency-key': idempotencyKey } }
      );
      toast.success('Split settled successfully via Wallet');
      fetchSplits();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Settlement failed. Check wallet balance.');
    } finally {
      setSettlingId(null);
    }
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
        <div className="sp-grid">
          {splits.map(split => {
            const isPaidByMe = split.paidBy._id === user._id;
            const myParticipantInfo = split.participants.find(p => p.user._id === user._id);
            const myShare = myParticipantInfo ? myParticipantInfo.share : 0;
            const amISettled = myParticipantInfo ? myParticipantInfo.paid : false;
            const allSettled = split.participants.every(p => p.paid);

            return (
              <Card key={split._id} hoverEffect padding="20px" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="sp-card-header">
                  <div>
                    <h3 className="sp-card-desc">{split.description}</h3>
                    <p className="sp-card-date">{new Date(split.createdAt).toLocaleDateString()}</p>
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
                  {split.participants.map(p => (
                    <div key={p.user._id} className="sp-participant-row">
                      <span className="sp-participant-name">
                        {p.user._id === user._id ? 'You' : p.user.name}
                      </span>
                      <span className="sp-participant-share">{fmt(p.share)}</span>
                      <span className={`sp-participant-status ${p.paid ? 'settled' : 'pending'}`} style={{ color: p.paid ? '#10b981' : '#f59e0b' }}>
                        {p.paid ? <CheckCircle size={14} /> : <Clock size={14} />}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {!isPaidByMe && !amISettled && (
                  <Button 
                    fullWidth 
                    style={{ marginTop: 'auto' }}
                    onClick={() => handleSettle(split._id)}
                    loading={settlingId === split._id}
                  >
                    Settle {fmt(myShare)}
                  </Button>
                )}
                {isPaidByMe && !allSettled && (
                  <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Waiting for others to settle
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Split Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Split</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}><X size={24} /></button>
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
                  {searchQuery.length >= 2 && (
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
                      <div key={p.user._id} className="sp-participant-item">
                        <span>{p.user.name} ({p.user.email})</span>
                        <button type="button" className="close-btn" onClick={() => removeParticipant(p.user._id)}>
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  The bill will be split equally between you and the selected participants.
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
        </div>
      )}
    </div>
  );
};

export default Splits;
