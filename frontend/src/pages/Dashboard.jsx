import { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import { motion, useSpring, useTransform } from 'framer-motion';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  Receipt, Lightbulb, Target, ChevronRight, RefreshCw
} from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import api from '../api';
import Card from '../components/ui/Card';
import './Dashboard.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const relativeTime = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// ── Animated Counter Component ───────────────────────────────────────────────
const AnimatedCounter = ({ value, prefix = '₹' }) => {
  const spring = useSpring(0, { mass: 1, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (current) => 
    `${prefix}${Math.round(current).toLocaleString('en-IN')}`
  );

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
};

// ── Sub-components ────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color, trend }) => (
  <Card hoverEffect padding="24px" style={{ position: 'relative', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: color, opacity: 0.1, filter: 'blur(30px)', borderRadius: '50%' }}></div>
    <div className="dash-stat-icon" style={{ color }}>{icon}</div>
    <div className="dash-stat-body">
      <p className="dash-stat-label">{label}</p>
      <h3 className="dash-stat-value">
        <AnimatedCounter value={value} />
      </h3>
      {sub && <p className="dash-stat-sub">{sub}</p>}
    </div>
    {trend !== undefined && (
      <div className={`dash-stat-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
        {trend >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(trend)}%
      </div>
    )}
  </Card>
);

const TransactionRow = ({ t }) => {
  const isIncome = t.type === 'income';
  return (
    <div className="dash-txn-row">
      <div className={`dash-txn-dot ${isIncome ? 'income' : 'expense'}`} />
      <div className="dash-txn-info">
        <p className="dash-txn-desc">{t.description || 'No description'}</p>
        <p className="dash-txn-meta">
          {t.category?.name || 'Uncategorized'} · {relativeTime(t.date || t.createdAt)}
        </p>
      </div>
      <span className={`dash-txn-amount ${isIncome ? 'income' : 'expense'}`}>
        {isIncome ? '+' : '-'}{fmt(t.amount)}
      </span>
    </div>
  );
};

const InsightCard = ({ insight, index }) => {
  const icons = ['💡', '📊', '⚠️', '🎯', '📈'];
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className="dash-insight-card"
    >
      <span className="dash-insight-icon">{icons[index % icons.length]}</span>
      <p>{insight}</p>
    </motion.div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState({
    summary: null,
    transactions: [],
    walletBalance: 0,
    insights: [],
    topExpenses: [],
    prediction: null,
  });

  const fetchAll = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [summary, txns, wallet, insights, topExp, prediction] = await Promise.allSettled([
        api.get('/analytics/summary'),
        api.get('/transactions?limit=6'),
        api.get('/wallet/balance'),
        api.get('/analytics/insights'),
        api.get('/analytics/top-expenses'),
        api.get('/analytics/prediction'),
      ]);

      setData({
        summary:      summary.status      === 'fulfilled' ? summary.value      : null,
        transactions: txns.status         === 'fulfilled' ? (Array.isArray(txns.value) ? txns.value : txns.value?.transactions || []) : [],
        walletBalance:wallet.status       === 'fulfilled' ? (wallet.value?.balance ?? wallet.value ?? wallet.value?.walletBalance ?? 0) : 0,
        insights:     insights.status     === 'fulfilled' ? (Array.isArray(insights.value) ? insights.value : insights.value?.insights || []) : [],
        topExpenses:  topExp.status       === 'fulfilled' ? (Array.isArray(topExp.value) ? topExp.value : topExp.value?.topExpenses || []) : [],
        prediction:   prediction.status   === 'fulfilled' ? prediction.value   : null,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const s = data.summary;
  const totalIncome  = s?.totalIncome  ?? s?.income  ?? 0;
  const totalExpense = s?.totalExpense ?? s?.expense ?? 0;
  const net          = totalIncome - totalExpense;
  const savingsRate  = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0;
  const budgetUsed   = totalIncome > 0 ? Math.min(Math.round((totalExpense / totalIncome) * 100), 100) : 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading) {
    return (
      <SkeletonTheme baseColor="rgba(30, 41, 59, 0.5)" highlightColor="rgba(255, 255, 255, 0.05)">
        <div className="dashboard">
          <div style={{ marginBottom: '32px' }}>
            <Skeleton height={40} width={250} />
            <Skeleton height={20} width={300} style={{ marginTop: '8px' }} />
          </div>
          <div className="dash-stats-grid" style={{ marginBottom: '32px' }}>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} height={140} borderRadius={16} />)}
          </div>
          <div className="dash-mid-grid">
            <Skeleton height={350} borderRadius={16} />
            <Skeleton height={350} borderRadius={16} />
          </div>
        </div>
      </SkeletonTheme>
    );
  }

  return (
    <div className="dashboard animate-fade-in">
      {/* ── Header ── */}
      <div className="dash-header">
        <div>
          <h1 className="dash-greeting">{greeting()}, {user?.name?.split(' ')[0] || 'there'} 👋</h1>
          <p className="dash-subtitle">Here's your financial overview for this month</p>
        </div>
        <button
          className={`dash-refresh-btn ${refreshing ? 'spinning' : ''}`}
          onClick={() => fetchAll(true)}
          title="Refresh"
        >
          <RefreshCw size={16} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div className="dash-stats-grid">
        <StatCard
          icon={<TrendingUp size={22} />}
          label="Total Income"
          value={totalIncome}
          sub={`${s?.transactionCount ?? 0} transactions`}
          color="#10b981"
        />
        <StatCard
          icon={<TrendingDown size={22} />}
          label="Total Expenses"
          value={totalExpense}
          sub={`${budgetUsed}% of income`}
          color="#ef4444"
        />
        <StatCard
          icon={<Wallet size={22} />}
          label="Wallet Balance"
          value={data.walletBalance.walletBalance ?? data.walletBalance}
          sub="Available to use"
          color="#6366f1"
        />
        <StatCard
          icon={<Target size={22} />}
          label="Net Savings"
          value={net}
          sub={`${savingsRate}% savings rate`}
          color={net >= 0 ? '#10b981' : '#ef4444'}
          trend={savingsRate}
        />
      </div>

      {/* ── Budget Bar ── */}
      <Card padding="24px" className="dash-budget-bar-card">
        <div className="dash-budget-header">
          <span>Monthly Budget Usage</span>
          <span className={budgetUsed >= 90 ? 'danger' : budgetUsed >= 70 ? 'warning' : 'safe'}>
            {budgetUsed}% used
          </span>
        </div>
        <div className="dash-budget-track">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${budgetUsed}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className={`dash-budget-fill ${budgetUsed >= 90 ? 'danger' : budgetUsed >= 70 ? 'warning' : 'safe'}`}
          />
        </div>
        <div className="dash-budget-labels">
          <span>{fmt(totalExpense)} spent</span>
          <span>{fmt(totalIncome)} income</span>
        </div>
      </Card>

      {/* ── Middle Row: Transactions + Insights ── */}
      <div className="dash-mid-grid">

        {/* Recent Transactions */}
        <Card padding="24px" className="dash-section">
          <div className="dash-section-header">
            <div className="dash-section-title">
              <Receipt size={18} />
              <h2>Recent Transactions</h2>
            </div>
            <Link to="/transactions" className="dash-see-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className="dash-txn-list">
            {data.transactions.length === 0 ? (
              <div className="dash-empty">No transactions yet. <Link to="/transactions">Add one →</Link></div>
            ) : (
              data.transactions.slice(0, 6).map((t, i) => <TransactionRow key={t._id || i} t={t} />)
            )}
          </div>
        </Card>

        {/* Smart Insights */}
        <Card padding="24px" className="dash-section">
          <div className="dash-section-header">
            <div className="dash-section-title">
              <Lightbulb size={18} />
              <h2>Smart Insights</h2>
            </div>
          </div>
          <div className="dash-insights-list">
            {data.insights.length === 0 ? (
              <div className="dash-empty">Add more transactions to get insights.</div>
            ) : (
              data.insights.slice(0, 4).map((ins, i) => (
                <InsightCard key={i} insight={typeof ins === 'string' ? ins : ins.message || ins.insight} index={i} />
              ))
            )}
          </div>

          {/* Prediction */}
          {data.prediction && (
            <div className="dash-prediction">
              <p className="dash-prediction-label">📈 Predicted next month</p>
              <p className="dash-prediction-value">
                <AnimatedCounter value={data.prediction?.predictedExpense ?? data.prediction?.prediction ?? data.prediction} />
              </p>
              <p className="dash-prediction-sub">Based on your last 3 months average</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Top Expenses ── */}
      {data.topExpenses.length > 0 && (
        <Card padding="24px" className="dash-section">
          <div className="dash-section-header">
            <div className="dash-section-title">
              <TrendingDown size={18} />
              <h2>Top Expenses This Month</h2>
            </div>
          </div>
          <div className="dash-top-expenses">
            {data.topExpenses.slice(0, 5).map((exp, i) => (
              <div key={i} className="dash-top-exp-row">
                <div className="dash-top-exp-rank">#{i + 1}</div>
                <div className="dash-top-exp-info">
                  <p>{exp.description || 'No description'}</p>
                  <span>{exp.category?.name || 'Uncategorized'}</span>
                </div>
                <span className="dash-top-exp-amount">{fmt(exp.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
