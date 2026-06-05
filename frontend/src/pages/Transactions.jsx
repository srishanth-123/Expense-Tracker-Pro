import { useState, useEffect, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { 
  Search, Plus, ArrowUpRight, ArrowDownRight, 
  Trash2, Edit2, RotateCcw, X, Inbox, Calendar, FolderEdit
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import CategoryManagerModal from '../components/CategoryManagerModal';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import './Transactions.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', {
  year: 'numeric', month: 'short', day: 'numeric'
});

const getLocalDateString = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDateRange = (filterType, customStartDate = '', customEndDate = '') => {
  const now = new Date();
  let startDate = null;
  let endDate = null;

  if (filterType === 'thisMonth') {
    const y = now.getFullYear();
    const m = now.getMonth();
    startDate = getLocalDateString(new Date(y, m, 1));
    endDate = getLocalDateString(new Date(y, m + 1, 0));
  } else if (filterType === 'lastMonth') {
    const y = now.getFullYear();
    const m = now.getMonth();
    startDate = getLocalDateString(new Date(y, m - 1, 1));
    endDate = getLocalDateString(new Date(y, m, 0));
  } else if (filterType === 'last3Months') {
    const y = now.getFullYear();
    const m = now.getMonth();
    startDate = getLocalDateString(new Date(y, m - 2, 1));
    endDate = getLocalDateString(new Date(y, m + 1, 0));
  } else if (filterType === 'thisFY') {
    const currentMonth = now.getMonth();
    const startYear = currentMonth >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    startDate = `${startYear}-04-01`;
    endDate = `${startYear + 1}-03-31`;
  } else if (filterType === 'custom') {
    startDate = customStartDate;
    endDate = customEndDate;
  }

  return { startDate, endDate };
};

// ── Main Component ────────────────────────────────────────────────────────────
const Transactions = () => {
  const { user, refreshUser } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  
  // ── State ──
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination & Filters (Initialized from URL if present)
  const [page, setPage] = useState(parseInt(searchParams.get('page')) || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  const [filters, setFilters] = useState(() => {
    const now = new Date();
    const defaultStartDate = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const defaultEndDate = getLocalDateString(now);
    return {
      type: searchParams.get('type') || '',
      category: searchParams.get('category') || '',
      search: searchParams.get('search') || '',
      dateRangeType: searchParams.get('dateRangeType') || 'all',
      customStartDate: searchParams.get('customStartDate') || defaultStartDate,
      customEndDate: searchParams.get('customEndDate') || defaultEndDate,
    };
  });

  // Mini Analytics Summary
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0 });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    type: 'expense',
    amount: '',
    category: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    paymentMethod: 'regular'
  });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, id: null, isRestore: false });
  const [deleting, setDeleting] = useState(false);

  // Inline Category Form State
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  // Toggle Scroll Lock when Create/Edit modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [isModalOpen]);

  // Sync filters to URL query params
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (filters.type) params.set('type', filters.type);
    if (filters.category) params.set('category', filters.category);
    if (filters.search) params.set('search', filters.search);
    if (filters.dateRangeType) params.set('dateRangeType', filters.dateRangeType);
    if (filters.dateRangeType === 'custom') {
      if (filters.customStartDate) params.set('customStartDate', filters.customStartDate);
      if (filters.customEndDate) params.set('customEndDate', filters.customEndDate);
    }
    setSearchParams(params);
  }, [filters, page, setSearchParams]);

  // Sync URL query params back to filters state when they change externally (e.g. from header search)
  useEffect(() => {
    const searchVal = searchParams.get('search') || '';
    const typeVal = searchParams.get('type') || '';
    const categoryVal = searchParams.get('category') || '';
    const dateRangeTypeVal = searchParams.get('dateRangeType') || 'all';
    const customStartVal = searchParams.get('customStartDate') || '';
    const customEndVal = searchParams.get('customEndDate') || '';
    const pageVal = parseInt(searchParams.get('page')) || 1;

    if (
      filters.search !== searchVal ||
      filters.type !== typeVal ||
      filters.category !== categoryVal ||
      filters.dateRangeType !== dateRangeTypeVal ||
      (dateRangeTypeVal === 'custom' && filters.customStartDate !== customStartVal && customStartVal) ||
      (dateRangeTypeVal === 'custom' && filters.customEndDate !== customEndVal && customEndVal) ||
      page !== pageVal
    ) {
      setFilters(prev => ({
        ...prev,
        search: searchVal,
        type: typeVal,
        category: categoryVal,
        dateRangeType: dateRangeTypeVal,
        customStartDate: dateRangeTypeVal === 'custom' && customStartVal ? customStartVal : prev.customStartDate,
        customEndDate: dateRangeTypeVal === 'custom' && customEndVal ? customEndVal : prev.customEndDate,
      }));
      setPage(pageVal);
    }
  }, [searchParams, filters, page]);

  // ── Fetch Data ──
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page, limit: 10 });
      if (filters.type) params.append('type', filters.type);
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      
      const { startDate, endDate } = getDateRange(filters.dateRangeType, filters.customStartDate, filters.customEndDate);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      const res = await api.get(`/transactions?${params.toString()}`);
      
      setTransactions(res.transactions || []);
      setTotalPages(res.pages || 1);
      setTotalItems(res.total || 0);
    } catch (err) {
      console.error('Fetch transactions error:', err);
      const msg = err.response?.status === 429 
        ? 'Too many requests. Please wait a moment.' 
        : err.response?.data?.message || 'Failed to fetch transactions';
      toast.error(msg);
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

  const fetchSummary = async () => {
    try {
      setSummaryLoading(true);
      const { startDate, endDate } = getDateRange(filters.dateRangeType, filters.customStartDate, filters.customEndDate);
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (filters.type) params.append('type', filters.type);
      if (filters.category) params.append('category', filters.category);
      if (filters.search) params.append('search', filters.search);
      
      const res = await api.get(`/analytics/summary?${params.toString()}`);
      setSummary(res || { totalIncome: 0, totalExpense: 0 });
    } catch (err) {
      console.error('Failed to fetch summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchSummary();
  }, [page, filters.type, filters.category, filters.search, filters.dateRangeType, filters.customStartDate, filters.customEndDate]);

  useEffect(() => {
    const handleUpdate = () => {
      fetchTransactions();
      fetchCategories();
      fetchSummary();
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => window.removeEventListener('financialDataUpdated', handleUpdate);
  }, []);

  // ── Actions ──
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const handleDateRangeTypeChange = (e) => {
    const value = e.target.value;
    setFilters(prev => ({ ...prev, dateRangeType: value }));
    setPage(1);
  };

  const openModal = (txn = null) => {
    setFormError('');
    setIsAddingCategory(false);
    setNewCategoryName('');
    if (txn) {
      setEditingId(txn._id);
      setFormData({
        type: txn.type,
        amount: txn.amount,
        category: txn.category?._id || txn.category,
        description: txn.description || '',
        date: new Date(txn.date || txn.createdAt).toISOString().split('T')[0],
        paymentMethod: 'regular'
      });
    } else {
      setEditingId(null);
      setFormData({
        type: 'expense',
        amount: '',
        category: categories.length > 0 ? categories[0]._id : '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'regular'
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
        if (formData.paymentMethod === 'wallet') {
          refreshUser();
        }
      }
      setIsModalOpen(false);
      fetchTransactions();
      fetchSummary();
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
      fetchSummary();
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
      <div className="tx-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="tx-title">Transactions</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button variant="secondary" onClick={() => setIsCategoryManagerOpen(true)} icon={FolderEdit}>
            Categories
          </Button>
          <Button onClick={() => openModal()} icon={Plus}>
            Add New
          </Button>
        </div>
      </div>

      {/* Mini-Analytics Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <Card padding="20px" style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.12)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Filtered Income</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--success)' }}>
            {summaryLoading ? '...' : fmt(summary.totalIncome)}
          </span>
        </Card>
        <Card padding="20px" style={{ background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.12)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Filtered Expenses</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--danger)' }}>
            {summaryLoading ? '...' : fmt(summary.totalExpense)}
          </span>
        </Card>
        <Card padding="20px" style={{ background: 'rgba(99, 102, 241, 0.04)', border: '1px solid rgba(99, 102, 241, 0.12)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Net Savings</span>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--primary)' }}>
            {summaryLoading ? '...' : fmt(summary.totalIncome - summary.totalExpense)}
          </span>
        </Card>
      </div>

      <Card padding="0" style={{ overflow: 'hidden' }}>
        
        {/* Filters and Search toolbar */}
        <div className="tx-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '16px', borderBottom: '1px solid var(--surface-border)', alignItems: 'center' }}>
          <div className="tx-search" style={{ flex: '1 1 240px' }}>
            <Search size={18} />
            <input 
              type="text" 
              name="search"
              placeholder="Search descriptions..." 
              value={filters.search}
              onChange={handleFilterChange}
            />
          </div>
          
          <select name="type" className="tx-select" value={filters.type} onChange={handleFilterChange} style={{ minWidth: '130px' }}>
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>

          <select name="category" className="tx-select" value={filters.category} onChange={handleFilterChange} style={{ minWidth: '160px' }}>
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>

          {/* Date Selector Dropdown */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', padding: '0 12px', height: '42px' }}>
              <Calendar size={16} color="var(--text-secondary)" />
              <select 
                value={filters.dateRangeType} 
                onChange={handleDateRangeTypeChange}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', height: '100%', fontSize: '0.9rem' }}
              >
                <option value="all">All Time</option>
                <option value="thisMonth">This Month</option>
                <option value="lastMonth">Last Month</option>
                <option value="last3Months">Last 3 Months</option>
                <option value="thisFY">This Financial Year (Apr-Mar)</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {/* Custom Date Range Picker Fields */}
            {filters.dateRangeType === 'custom' && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input 
                  type="date" 
                  name="customStartDate"
                  className="tx-select"
                  value={filters.customStartDate} 
                  onChange={handleFilterChange}
                  style={{ height: '42px', padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' }}
                />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>to</span>
                <input 
                  type="date" 
                  name="customEndDate"
                  className="tx-select"
                  value={filters.customEndDate} 
                  onChange={handleFilterChange}
                  style={{ height: '42px', padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--surface-border)', borderRadius: '8px', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>
            )}
          </div>
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
          ) : transactions.length === 0 ? (
            <EmptyState 
              icon={Inbox}
              title="No transactions found"
              description="Try adjusting your filters or add a new transaction."
              actionButton={<Button onClick={() => openModal()}>Add Transaction</Button>}
              style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}
            />
          ) : (
            transactions.map(t => {
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
        {!loading && (
          <div className="tx-pagination">
            <span>Showing page {page} of {totalPages} ({totalItems} total)</span>
            <div className="tx-page-controls">
              <button 
                className="tx-page-btn"
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button 
                className="tx-page-btn"
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
        
        <div style={{ height: '16px' }} />
      </Card>

      {/* ── Add/Edit Modal (Rendered via React Portal under document.body) ── */}
      {isModalOpen && createPortal(
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
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCategory();
                        }
                      }}
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

              {formData.type === 'expense' && (
                <div>
                  <label>Payment Method</label>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className={`type-btn ${formData.paymentMethod === 'regular' ? 'active' : ''}`}
                      onClick={() => setFormData({...formData, paymentMethod: 'regular'})}
                      style={{ flex: 1 }}
                    >
                      Regular
                    </button>
                    <button
                      type="button"
                      className={`type-btn ${formData.paymentMethod === 'wallet' ? 'active' : ''}`}
                      onClick={() => setFormData({...formData, paymentMethod: 'wallet'})}
                      style={{ flex: 1 }}
                    >
                      Wallet
                    </button>
                  </div>
                  {formData.paymentMethod === 'wallet' && (
                    <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Available: ₹{user?.walletBalance?.toLocaleString() || 0}
                    </div>
                  )}
                </div>
              )}

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
        </div>,
        document.body
      )}

      {/* Standalone Category Manager Modal */}
      <CategoryManagerModal 
        isOpen={isCategoryManagerOpen} 
        onClose={() => setIsCategoryManagerOpen(false)}
        onCategoriesUpdated={() => {
          fetchCategories();
          fetchTransactions();
        }}
      />

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
