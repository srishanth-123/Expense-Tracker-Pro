import React from 'react';
import { motion } from 'framer-motion';
import { Wallet, TrendingDown, PiggyBank, AlertTriangle } from 'lucide-react';
import Card from '../ui/Card';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const StatBox = ({ icon: Icon, label, value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={22} />
    </div>
    <div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  </div>
);

const BudgetSummary = ({ summary }) => {
  if (!summary) return null;
  const { totalBudget = 0, totalSpent = 0, totalRemaining = 0, overallPercentage = 0, overspending = [] } = summary;
  const barColor = overallPercentage > 100 ? 'var(--danger)' : overallPercentage >= 80 ? 'var(--warning)' : 'var(--success)';

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '20px',
        }}
      >
        <StatBox icon={Wallet} label="Total Budget" value={fmt(totalBudget)} color="var(--primary)" />
        <StatBox icon={TrendingDown} label="Total Spent" value={fmt(totalSpent)} color="var(--danger)" />
        <StatBox icon={PiggyBank} label="Remaining" value={fmt(totalRemaining)} color="var(--success)" />
        <StatBox icon={AlertTriangle} label="Overspending" value={`${overspending.length} ${overspending.length === 1 ? 'category' : 'categories'}`} color="var(--warning)" />
      </div>

      {/* Overall usage bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Overall Usage</span>
          <span style={{ color: barColor, fontWeight: 600 }}>{overallPercentage}%</span>
        </div>
        <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-border)', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(overallPercentage, 100)}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            style={{ height: '100%', background: barColor, borderRadius: 999 }}
          />
        </div>
      </div>
    </Card>
  );
};

export default BudgetSummary;
