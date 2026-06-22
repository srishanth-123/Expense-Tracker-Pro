import { motion } from 'framer-motion';
import { Pencil, Trash2, AlertTriangle, CheckCircle2, TrendingUp } from 'lucide-react';
import Card from '../ui/Card';
import CircularProgress from './CircularProgress';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const STATUS_COLORS = {
  safe: 'var(--success)',
  warning: 'var(--warning)',
  exceeded: 'var(--danger)',
};

const STATUS_META = {
  safe: { label: 'On Track', icon: CheckCircle2 },
  warning: { label: 'Warning', icon: AlertTriangle },
  exceeded: { label: 'Exceeded', icon: TrendingUp },
};

const BudgetCard = ({ budget, onEdit, onDelete }) => {
  const limit = budget.limit ?? budget.amount ?? 0;
  const spent = budget.spentAmount ?? 0;
  const percentage = budget.percentage ?? (limit > 0 ? Math.round((spent / limit) * 100) : 0);
  const remaining = budget.remaining ?? Math.max(limit - spent, 0);
  const status = budget.status || 'safe';
  const color = STATUS_COLORS[status];
  const meta = STATUS_META[status] || STATUS_META.safe;
  const StatusIcon = meta.icon;
  const categoryName = budget.category?.name || 'Uncategorized';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card hoverEffect style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
              {categoryName}
            </h3>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color,
                background: `${color}1a`,
                padding: '3px 10px',
                borderRadius: '999px',
              }}
            >
              <StatusIcon size={13} /> {meta.label}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => onEdit(budget)}
              title="Edit budget"
              style={iconBtnStyle}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => onDelete(budget)}
              title="Delete budget"
              style={{ ...iconBtnStyle, color: 'var(--danger)' }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Body: progress + figures */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <CircularProgress percentage={percentage} status={status} size={104} stroke={9} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <Figure label="Spent" value={fmt(spent)} color={color} />
            <Figure label="Budget" value={fmt(limit)} color="var(--text-primary)" />
            <Figure
              label={spent > limit ? 'Over by' : 'Remaining'}
              value={spent > limit ? fmt(spent - limit) : fmt(remaining)}
              color={spent > limit ? 'var(--danger)' : 'var(--success)'}
            />
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

const Figure = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontSize: '0.95rem', fontWeight: 600, color }}>{value}</span>
  </div>
);

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  padding: '6px',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  transition: 'background 0.2s',
};

export default BudgetCard;
