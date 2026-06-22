import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Target, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import budgetApi from '../services/budgetApi';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ConfirmModal from '../components/ui/ConfirmModal';
import BudgetCard from '../components/budgets/BudgetCard';
import BudgetForm from '../components/budgets/BudgetForm';
import BudgetSummary from '../components/budgets/BudgetSummary';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const Budgets = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [budgets, setBudgets] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirm, setConfirm] = useState({ open: false, budget: null });
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [allBudgets, summaryRes, cats] = await Promise.all([
        budgetApi.getBudgets(),
        budgetApi.getBudgetSummary(month, year),
        budgetApi.getCategories(),
      ]);

      const budgetList = Array.isArray(allBudgets) ? allBudgets : allBudgets?.budgets || [];
      // Only show budgets for the selected month/year.
      setBudgets(budgetList.filter((b) => b.month === month && b.year === year));
      setSummary(summaryRes);
      setCategories(Array.isArray(cats) ? cats : cats?.categories || []);
    } catch (err) {
      toast.error(err.message || 'Failed to load budgets');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateTimer = useRef(null);
  useEffect(() => {
    const handleUpdate = () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(() => {
        fetchData(true);
      }, 600);
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => {
      window.removeEventListener('financialDataUpdated', handleUpdate);
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, [fetchData]);

  const changeMonth = (dir) => {
    let m = month + dir;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    else if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
  };

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (budget) => { setEditing(budget); setFormOpen(true); };

  const handleSubmit = async (payload) => {
    try {
      setSubmitting(true);
      if (editing) {
        await budgetApi.updateBudget(editing._id, payload);
        toast.success('Budget updated');
      } else {
        await budgetApi.createBudget(payload);
        toast.success('Budget created');
      }
      setFormOpen(false);
      setEditing(null);
      // Jump to the month/year of the saved budget so it is visible.
      const newMonth = Number(payload.month);
      const newYear = Number(payload.year);
      if (newMonth === month && newYear === year) {
        fetchData();
      } else {
        setMonth(newMonth);
        setYear(newYear);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to save budget';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm.budget) return;
    try {
      setDeleting(true);
      await budgetApi.deleteBudget(confirm.budget._id);
      toast.success('Budget deleted');
      setConfirm({ open: false, budget: null });
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to delete budget');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '12px', color: 'var(--primary-text)' }}>
            <Target size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)' }}>Budgets</h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Track your monthly spending against category budgets</p>
          </div>
        </div>
        <Button icon={Plus} onClick={openCreate}>New Budget</Button>
      </div>

      {/* Month selector */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <button onClick={() => changeMonth(-1)} style={navBtnStyle} title="Previous month">
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '170px', textAlign: 'center' }}>
          {MONTHS[month - 1]} {year}
        </span>
        <button onClick={() => changeMonth(1)} style={navBtnStyle} title="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <SkeletonTheme baseColor="var(--skeleton-base)" highlightColor="var(--skeleton-highlight)">
          <Skeleton height={120} borderRadius={16} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={220} borderRadius={16} />)}
          </div>
        </SkeletonTheme>
      ) : (
        <>
          <BudgetSummary summary={summary} />

          {budgets.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No budgets for this month"
              description="Create a category budget to start tracking your spending for this period."
              actionButton={<Button icon={Plus} onClick={openCreate}>Create Budget</Button>}
            />
          ) : (
            <motion.div
              layout
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}
            >
              {budgets.map((b) => (
                <BudgetCard key={b._id} budget={b} onEdit={openEdit} onDelete={(bud) => setConfirm({ open: true, budget: bud })} />
              ))}
            </motion.div>
          )}
        </>
      )}

      <BudgetForm
        isOpen={formOpen}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSubmit={handleSubmit}
        categories={categories}
        editing={editing}
        defaultMonth={month}
        defaultYear={year}
        submitting={submitting}
      />

      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => !deleting && setConfirm({ open: false, budget: null })}
        onConfirm={handleDelete}
        title="Delete budget?"
        message={`This will remove the budget for "${confirm.budget?.category?.name || 'this category'}". You can recreate it later.`}
        confirmText="Delete"
        loading={deleting}
      />
    </div>
  );
};

const navBtnStyle = {
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  padding: '8px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
};

export default Budgets;
