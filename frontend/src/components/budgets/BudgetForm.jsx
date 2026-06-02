import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '8px',
  background: 'var(--input-bg)',
  border: '1px solid var(--input-border)',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  outline: 'none',
};

const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' };

/**
 * Create / edit budget modal.
 * @param {Object|null} editing - existing budget when editing, null when creating
 */
const BudgetForm = ({ isOpen, onClose, onSubmit, categories, editing, defaultMonth, defaultYear, submitting }) => {
  const now = new Date();
  const [form, setForm] = useState({
    category: '',
    amount: '',
    month: defaultMonth || now.getMonth() + 1,
    year: defaultYear || now.getFullYear(),
    warningThreshold: 80,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      setForm({
        category: editing.category?._id || editing.category || '',
        amount: editing.limit ?? editing.amount ?? '',
        month: editing.month,
        year: editing.year,
        warningThreshold: editing.warningThreshold ?? 80,
      });
    } else {
      setForm({
        category: categories[0]?._id || '',
        amount: '',
        month: defaultMonth || now.getMonth() + 1,
        year: defaultYear || now.getFullYear(),
        warningThreshold: 80,
      });
    }
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!editing && !form.category) {
      setError('Please select a category.');
      return;
    }
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) {
      setError('Budget amount must be a positive number.');
      return;
    }
    onSubmit({
      category: form.category,
      amount: Number(form.amount),
      month: Number(form.month),
      year: Number(form.year),
      warningThreshold: Number(form.warningThreshold),
    });
  };

  const years = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) years.push(y);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
          style={{
            position: 'fixed', inset: 0, background: 'var(--modal-backdrop)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px',
          }}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="glass-card"
            style={{ width: '100%', maxWidth: '440px', padding: '28px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {editing ? 'Edit Budget' : 'Create Budget'}
              </h2>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={22} />
              </button>
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={inputStyle}
                  disabled={!!editing}
                >
                  <option value="" disabled>Select a category</option>
                  {categories.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Budget Amount (₹)</label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="e.g. 10000"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Month</label>
                  <select value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} style={inputStyle}>
                    {MONTHS.map((m, i) => (
                      <option key={m} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Year</label>
                  <select value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} style={inputStyle}>
                    {years.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Warning Threshold: {form.warningThreshold}%</label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={form.warningThreshold}
                  onChange={(e) => setForm({ ...form, warningThreshold: e.target.value })}
                  style={{ width: '100%', accentColor: 'var(--primary)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <Button variant="secondary" fullWidth onClick={onClose} type="button">Cancel</Button>
                <Button type="submit" fullWidth loading={submitting}>
                  {editing ? 'Save Changes' : 'Create Budget'}
                </Button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BudgetForm;
