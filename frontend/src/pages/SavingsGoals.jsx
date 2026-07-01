import { useState, useEffect, useCallback } from 'react';
import { Target, Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Edit3, X, CheckCircle } from 'lucide-react';
import api from '../api';
import toast from 'react-hot-toast';
import Card from '../components/ui/Card';

const ICON_OPTIONS = ['🎯', '🏠', '✈️', '🚗', '📱', '💍', '🎓', '💰', '🏥', '🎮'];
const COLOR_OPTIONS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4'];

const SavingsGoals = () => {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [contributeModal, setContributeModal] = useState(null);
  const [withdrawModal, setWithdrawModal] = useState(null);
  const [formData, setFormData] = useState({ name: '', targetAmount: '', deadline: '', icon: '🎯', color: '#6366f1' });
  const [amount, setAmount] = useState('');

  const fetchGoals = useCallback(async () => {
    try {
      const data = await api.get('/savings-goals');
      setGoals(data || []);
    } catch {
      toast.error('Failed to load savings goals');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingGoal) {
        await api.put(`/savings-goals/${editingGoal._id}`, formData);
        toast.success('Goal updated');
      } else {
        await api.post('/savings-goals', formData);
        toast.success('Goal created!');
      }
      setShowForm(false);
      setEditingGoal(null);
      setFormData({ name: '', targetAmount: '', deadline: '', icon: '🎯', color: '#6366f1' });
      fetchGoals();
    } catch (err) {
      toast.error(err.message || 'Failed to save goal');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this savings goal? Any saved amount will be refunded to your wallet.')) return;
    try {
      const res = await api.delete(`/savings-goals/${id}`);
      toast.success(res.message || 'Goal deleted');
      window.dispatchEvent(new Event('financialDataUpdated'));
      fetchGoals();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleContribute = async (goalId) => {
    try {
      const res = await api.post(`/savings-goals/${goalId}/contribute`, { amount: parseFloat(amount) });
      toast.success(res.message || 'Contribution added!');
      setContributeModal(null);
      setAmount('');
      window.dispatchEvent(new Event('financialDataUpdated'));
      fetchGoals();
    } catch (err) {
      toast.error(err.message || 'Failed to contribute');
    }
  };

  const handleWithdraw = async (goalId) => {
    try {
      const res = await api.post(`/savings-goals/${goalId}/withdraw`, { amount: parseFloat(amount) });
      toast.success(res.message || 'Withdrawn successfully');
      setWithdrawModal(null);
      setAmount('');
      window.dispatchEvent(new Event('financialDataUpdated'));
      fetchGoals();
    } catch (err) {
      toast.error(err.message || 'Failed to withdraw');
    }
  };

  const startEdit = (goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      targetAmount: goal.targetAmount,
      deadline: goal.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '',
      icon: goal.icon,
      color: goal.color
    });
    setShowForm(true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: '32px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '12px', color: 'white' }}>
            <Target size={24} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Savings Goals</h1>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingGoal(null); setFormData({ name: '', targetAmount: '', deadline: '', icon: '🎯', color: '#6366f1' }); }}
          className="btn"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px' }}
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? 'Cancel' : 'New Goal'}
        </button>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <Card style={{ padding: '24px', marginBottom: '24px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Goal Name</label>
              <input
                type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Emergency Fund, Vacation"
                required style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Target Amount (₹)</label>
                <input type="number" value={formData.targetAmount} onChange={e => setFormData({ ...formData, targetAmount: e.target.value })} placeholder="10000" required min="1" />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Deadline (optional)</label>
                <input type="date" value={formData.deadline} onChange={e => setFormData({ ...formData, deadline: e.target.value })} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Icon</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {ICON_OPTIONS.map(icon => (
                  <button key={icon} type="button" onClick={() => setFormData({ ...formData, icon })}
                    style={{ fontSize: '1.5rem', padding: '8px 12px', borderRadius: '10px', border: formData.icon === icon ? '2px solid var(--primary)' : '2px solid transparent', background: formData.icon === icon ? 'rgba(99,102,241,0.15)' : 'var(--surface)', cursor: 'pointer', transition: 'all 0.2s' }}>
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Color</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {COLOR_OPTIONS.map(color => (
                  <button key={color} type="button" onClick={() => setFormData({ ...formData, color })}
                    style={{ width: '32px', height: '32px', borderRadius: '50%', background: color, border: formData.color === color ? '3px solid white' : '3px solid transparent', cursor: 'pointer', boxShadow: formData.color === color ? `0 0 0 2px ${color}` : 'none', transition: 'all 0.2s' }} />
                ))}
              </div>
            </div>
            <button type="submit" className="btn" style={{ marginTop: '8px' }}>
              {editingGoal ? 'Update Goal' : 'Create Goal'}
            </button>
          </form>
        </Card>
      )}

      {/* Goals List */}
      {goals.length === 0 ? (
        <Card style={{ padding: '48px', textAlign: 'center' }}>
          <Target size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>No Savings Goals Yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Start saving towards your financial dreams by creating a goal!</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {goals.map(goal => {
            const progress = goal.targetAmount > 0 ? Math.min((goal.currentAmount / goal.targetAmount) * 100, 100) : 0;
            const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
            const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;

            return (
              <Card key={goal._id} style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
                {/* Completion badge */}
                {goal.isCompleted && (
                  <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(16, 185, 129, 0.15)', padding: '4px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '0.78rem', fontWeight: 600 }}>
                    <CheckCircle size={14} /> Completed
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '2rem', width: '52px', height: '52px', borderRadius: '14px', background: `${goal.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {goal.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{goal.name}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      ₹{goal.currentAmount.toLocaleString('en-IN')} / ₹{goal.targetAmount.toLocaleString('en-IN')}
                      {daysLeft !== null && <span style={{ marginLeft: '12px', color: daysLeft < 7 ? '#ef4444' : 'var(--text-secondary)' }}>• {daysLeft > 0 ? `${daysLeft} days left` : 'Past deadline'}</span>}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ width: '100%', height: '8px', background: 'var(--surface-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
                  <div style={{ width: `${progress}%`, height: '100%', background: `linear-gradient(90deg, ${goal.color}, ${goal.color}cc)`, borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {progress.toFixed(1)}% • ₹{remaining.toLocaleString('en-IN')} remaining
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!goal.isCompleted && (
                      <button onClick={() => { setContributeModal(goal._id); setAmount(''); }}
                        style={{ background: 'rgba(16, 185, 129, 0.12)', border: 'none', padding: '8px 14px', borderRadius: '8px', color: '#10b981', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowDownCircle size={14} /> Add
                      </button>
                    )}
                    {goal.currentAmount > 0 && (
                      <button onClick={() => { setWithdrawModal(goal._id); setAmount(''); }}
                        style={{ background: 'rgba(245, 158, 11, 0.12)', border: 'none', padding: '8px 14px', borderRadius: '8px', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ArrowUpCircle size={14} /> Withdraw
                      </button>
                    )}
                    <button onClick={() => startEdit(goal)}
                      style={{ background: 'rgba(99, 102, 241, 0.12)', border: 'none', padding: '8px', borderRadius: '8px', color: 'var(--primary)', cursor: 'pointer' }}>
                      <Edit3 size={14} />
                    </button>
                    <button onClick={() => handleDelete(goal._id)}
                      style={{ background: 'rgba(239, 68, 68, 0.12)', border: 'none', padding: '8px', borderRadius: '8px', color: '#ef4444', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Contribute Modal */}
                {contributeModal === goal._id && (
                  <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(16,185,129,0.06)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)" min="1" style={{ flex: 1 }} />
                      <button onClick={() => handleContribute(goal._id)} className="btn" style={{ padding: '10px 20px', background: '#10b981' }} disabled={!amount || parseFloat(amount) <= 0}>Add</button>
                      <button onClick={() => setContributeModal(null)} style={{ background: 'transparent', border: '1px solid var(--surface-border)', padding: '10px', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                  </div>
                )}

                {/* Withdraw Modal */}
                {withdrawModal === goal._id && (
                  <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(245,158,11,0.06)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (₹)" min="1" max={goal.currentAmount} style={{ flex: 1 }} />
                      <button onClick={() => handleWithdraw(goal._id)} className="btn" style={{ padding: '10px 20px', background: '#f59e0b' }} disabled={!amount || parseFloat(amount) <= 0}>Withdraw</button>
                      <button onClick={() => setWithdrawModal(null)} style={{ background: 'transparent', border: '1px solid var(--surface-border)', padding: '10px', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SavingsGoals;
