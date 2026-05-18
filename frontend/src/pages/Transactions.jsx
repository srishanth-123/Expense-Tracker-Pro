import { useState, useEffect } from 'react';
import { 
  Search, Plus, ArrowUpRight, ArrowDownRight, 
  Trash2, Edit2, RotateCcw, X, Inbox
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './Transactions.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', {
  year: 'numeric', month: 'short', day: 'numeric'
});

// ── Main Component ────────────────────────────────────────────────────────────
const Transactions = () => {
  // ── State ──
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [filters, setFilters] = useState({
    type: '',
    category: '',
    search: '', 
  });

  // Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null, isRestore: false });
  const [deleting, setDeleting] = useState(false);

  // Category Form State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // ── Fetch Data ──
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filters.type) params.append('type', filters.type);
      if (filters.category) params.append('category', filters.category);
      
      const res = await api.get(`/transactions?${params.toString()}`);
      
      setTransactions(res.transactions || []);
      setTotalPages(res.pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      toast.error('Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/categories');
      setCategories(Array.isArray(res) ? res : res.categories || []);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page, filters.type, filters.category]);

  const filteredTransactions = transactions.filter(t => 
    t.description?.toLowerCase().includes(filters.search.toLowerCase())
  );

  // ── Actions ──
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const openModal = (txn = null) => {
    setFormError('');
    if (txn) {
      setEditingId(txn._id);
      setFormData({
        type: txn.type,
        amount: txn.amount,
        category: txn.category?._id || txn.category,
        description: txn.description || '',
        date: new Date(txn.date || txn.createdAt).toISOString().split('T')[0]
      });
    } else {
      setEditingId(null);
      setFormData({
        type: 'expense',
        amount: '',
        category: categories.length > 0 ? categories[0]._id : '',
        description: '',
        date: new Date().toISOString().split('T')[0]
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      if (editingId) {
        await api.put(`/transactions/${editingId}`, formData);
        toast.success('Transaction updated');
      } else {
        await api.post('/transactions', formData);
        toast.success('Transaction added');
      }
      setIsModalOpen(false);
      fetchTransactions();
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to save transaction');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmAction = async () => {
    setDeleting(true);
    try {
      if (confirmModal.isRestore) {
        await api.post(`/transactions/${confirmModal.id}/restore`);
        toast.success('Transaction restored');
      } else {
        await api.delete(`/transactions/${confirmModal.id}`);
        toast.success('Transaction deleted');
      }
      fetchTransactions();
    } catch (err) {
      toast.error('Action failed');
    } finally {
      setDeleting(false);
      setConfirmModal({ isOpen: false, id: null, isRestore: false });
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      setAddingCategory(true);
      const res = await api.post('/categories', { name: newCategoryName.trim() });
      const newCat = res.data || res;
      
      await fetchCategories();
      setFormData({ ...formData, category: newCat._id });
      setIsAddingCategory(false);
      setNewCategoryName('');
      toast.success('Category added');
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to add category');
    } finally {
      setAddingCategory(false);
    }
  };

  // ── Render ──
  return (
    <div className="transactions-page">
      {/* Header */}
      <div className="tx-header">
        <h1 className="tx-title">Transactions</h1>
        <Button onClick={() => openModal()} icon={Plus}>
          Add New
        </Button>
      </div>

      <Card padding="0" style={{ overflow: 'hidden' }}>
        
        {/* Filters */}
        <div className="tx-filters">
          <div className="tx-search">
            <Search size={18} />
            <input 
              type="text" 
              name="search"
              placeholder="Search descriptions..." 
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>
          
          <select name="type" className="tx-select" value={filters.type} onChange={handleFilterChange}>
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <select name="category" className="tx-select" value={filters.category} onChange={handleFilterChange}>
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Data Grid */}
        <div className="tx-list-container">
          <div className="tx-table-header">
            <span>Transaction</span>
            <span>Category</span>
            <span>Date</span>
            <span style={{ textAlign: 'right' }}>Amount</span>
            <span style={{ textAlign: 'center', width: '80px' }}>Actions</span>
          </div>

          {loading ? (
            <div style={{ padding: '24px' }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ marginBottom: '16px' }}>
                  <Skeleton height={60} baseColor="rgba(255,255,255,0.05)" highlightColor="rgba(255,255,255,0.1)" borderRadius={12} />
                </div>
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState 
              icon={Inbox}
              title="No transactions found"
              description="Try adjusting your filters or add a new transaction."
              actionButton={<Button onClick={() => openModal()}>Add Transaction</Button>}
              style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
            />
          ) : (
            filteredTransactions.map(t => {
              const isIncome = t.type === 'income';
              const isDeleted = t.isDeleted;
              
              return (
                <div key={t._id} className={`tx-row ${isDeleted ? 'deleted' : ''}`}>
                  <div className="tx-cell-desc">
                    <div className={`tx-icon ${isIncome ? 'income' : 'expense'}`}>
                      {isIncome ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    </div>
                    <div className="tx-desc-text">
                      <h4>{t.description || 'No description'}</h4>
                      {isDeleted && <span style={{ color: 'var(--danger)' }}>(Deleted)</span>}
                    </div>
                  </div>
                  
                  <div className="tx-cell-category">
                    {t.category?.name || 'Uncategorized'}
                  </div>

                  <div className="tx-cell-date">
                    {fmtDate(t.date || t.createdAt)}
                  </div>

                  <div className={`tx-cell-amount ${isIncome ? 'income' : 'expense'}`} style={{ textAlign: 'right' }}>
                    {isIncome ? '+' : '-'}{fmt(t.amount)}
                  </div>

                  <div className="tx-actions" style={{ justifyContent: 'center', width: '80px' }}>
                    {isDeleted ? (
                      <button className="tx-action-btn" title="Restore" onClick={() => setConfirmModal({ isOpen: true, id: t._id, isRestore: true })}>
                        <RotateCcw size={16} />
                      </button>
                    ) : (
                      <>
                        <button className="tx-action-btn" title="Edit" onClick={() => openModal(t)}>
                          <Edit2 size={16} />
                        </button>
                        <button className="tx-action-btn delete" title="Delete" onClick={() => setConfirmModal({ isOpen: true, id: t._id, isRestore: false })}>
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="tx-pagination">
            <span>Showing page {page} of {totalPages} ({totalItems} total)</span>
            <div className="tx-page-controls">
              <Button 
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button 
                variant="secondary"
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        
        <div style={{ height: '16px' }} />
      </Card>

      {/* ── Add/Edit Modal ── */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingId ? 'Edit Transaction' : 'Add Transaction'}</h2>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={24} />
              </button>
            </div>

            {formError && (
              <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginBottom: '16px', padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>
                {formError}
              </div>
            )}

            <form className="tx-form" onSubmit={handleSubmit}>
              
              <div className="type-toggle">
                <button type="button" 
                  className={`type-btn expense ${formData.type === 'expense' ? 'active' : ''}`}
                  onClick={() => setFormData({...formData, type: 'expense'})}
                >
                  Expense
                </button>
                <button type="button" 
                  className={`type-btn income ${formData.type === 'income' ? 'active' : ''}`}
                  onClick={() => setFormData({...formData, type: 'income'})}
                >
                  Income
                </button>
              </div>

              <div>
                <label>Amount (₹)</label>
                <input 
                  type="number" 
                  min="1" 
                  step="any"
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={e => setFormData({...formData, amount: e.target.value})}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ margin: 0 }}>Category</label>
                  {!isAddingCategory ? (
                    <button type="button" className="btn-text" style={{ fontSize: '0.8rem', color: 'var(--primary)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setIsAddingCategory(true)}>
                      <Plus size={14} /> New
                    </button>
                  ) : (
                    <button type="button" className="btn-text" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setIsAddingCategory(false)}>
                      Cancel
                    </button>
                  )}
                </div>

                {isAddingCategory ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      placeholder="e.g. Groceries"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button 
                      onClick={handleAddCategory}
                      loading={addingCategory}
                      disabled={!newCategoryName.trim()}
                    >
                      Add
                    </Button>
                  </div>
                ) : (
                  <select 
                    required
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                  >
                    <option value="" disabled>Select a category</option>
                    {categories
                      .filter(c => c.type === formData.type || c.type === 'both' || !c.type) 
                      .map(c => <option key={c._id} value={c._id}>{c.name}</option>)
                    }
                  </select>
                )}
              </div>

              <div>
                <label>Description</label>
                <input 
                  type="text" 
                  placeholder="What was this for?"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div>
                <label>Date</label>
                <input 
                  type="date" 
                  required
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <Button variant="secondary" fullWidth onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" fullWidth loading={submitting}>
                  Save Transaction
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        onClose={() => !deleting && setConfirmModal({ isOpen: false, id: null, isRestore: false })}
        onConfirm={handleConfirmAction}
        title={confirmModal.isRestore ? 'Restore Transaction' : 'Delete Transaction'}
        message={confirmModal.isRestore ? 'Are you sure you want to restore this transaction?' : 'Are you sure you want to delete this transaction?'}
        confirmText={confirmModal.isRestore ? 'Restore' : 'Delete'}
        isDanger={!confirmModal.isRestore}
        loading={deleting}
      />
    </div>
  );
};

export default Transactions;
