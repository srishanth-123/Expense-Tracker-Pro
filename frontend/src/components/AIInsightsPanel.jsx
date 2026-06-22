import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles, RefreshCw, TrendingUp, TrendingDown, PieChart, AlertTriangle,
  PiggyBank, Calendar, Zap, Target, Activity, Loader
} from 'lucide-react';
import api from '../api';
import Card from './ui/Card';
import { useSocket } from '../context/SocketContext';
import { AuthContext } from '../context/AuthContext';
import { useContext } from 'react';
import { Lock } from 'lucide-react';

const ProOverlay = () => (
  <div style={{
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(15, 23, 42, 0.75)',
    backdropFilter: 'blur(4px)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    zIndex: 10, borderRadius: 'inherit'
  }}>
    <div style={{ background: 'rgba(168, 85, 247, 0.2)', padding: '12px', borderRadius: '50%', marginBottom: '12px' }}>
      <Lock size={24} color="#a855f7" />
    </div>
    <h4 style={{ color: 'white', margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>PRO Feature</h4>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>Upgrade to unlock</p>
  </div>
);

const ICON_MAP = {
  'trending-up': TrendingUp,
  'trending-down': TrendingDown,
  'pie-chart': PieChart,
  'alert-triangle': AlertTriangle,
  'piggy-bank': PiggyBank,
  'calendar': Calendar,
  'zap': Zap,
  'target': Target,
  'activity': Activity,
};

const SEVERITY_STYLES = {
  info:    { accent: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)' },
  success: { accent: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
  warning: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
  danger:  { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)' },
};

const InsightCard = ({ insight, index }) => {
  const Icon = ICON_MAP[insight.icon] || Activity;
  const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;

  return (
    <div
      className="ai-insight-card"
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        animation: `aiInsightFade 0.5s ease ${index * 0.08}s both`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          background: style.accent,
          color: '#fff',
          width: 32, height: 32,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} />
        </div>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          {insight.title}
        </h4>
      </div>
      <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
        {insight.message}
      </p>
    </div>
  );
};

const AIInsightsPanel = () => {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const { socket } = useSocket();

  const load = useCallback(async (force = false) => {
    try {
      force ? setRefreshing(true) : setLoading(true);
      setError(null);
      const res = await api.get(`/analytics/ai-insights${force ? '?refresh=true' : ''}`);

      // BullMQ returns 202 with { status: "processing" }
      if (res?.status === 'processing') {
        setProcessing(true);
        setRefreshing(false);
        setLoading(false);
        return;
      }

      // api interceptor already unwraps { success, data }
      setData(res);
      setProcessing(false);
    } catch (err) {
      console.error('AI insights load failed:', err);
      setError(err?.message || 'Failed to load AI insights');
      setProcessing(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(false);
  }, [load]);

  // Listen for background worker completion via Socket.io
  useEffect(() => {
    if (!socket) return;

    const handleInsightsReady = (notification) => {
      if (notification?.type === 'insights_ready' && notification?.data) {
        setData(notification.data);
        setProcessing(false);
        setLoading(false);
        setRefreshing(false);
      }
    };

    socket.on('new_notification', handleInsightsReady);
    return () => socket.off('new_notification', handleInsightsReady);
  }, [socket]);

  return (
    <Card style={{ minWidth: 0, position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @keyframes aiInsightFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes aiShimmer {
          0% { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
        @keyframes aiPulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        .ai-insight-card { transition: transform 0.2s ease; }
        .ai-insight-card:hover { transform: translateY(-2px); }
        .ai-skeleton {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%);
          background-size: 400px 100%;
          animation: aiShimmer 1.4s linear infinite;
          border-radius: 14px;
        }
      `}</style>
      {user?.plan !== 'PRO' && !user?.isPro && <ProOverlay />}

      {/* Decorative gradient blob */}
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 140, height: 140,
        background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
        opacity: 0.15, filter: 'blur(40px)', borderRadius: '50%',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            color: '#fff', padding: 8, borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Sparkles size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
              AI Financial Insights
            </h3>
            {processing ? (
              <span style={{
                fontSize: '0.72rem',
                color: '#8b5cf6',
                letterSpacing: 0.3,
                display: 'flex', alignItems: 'center', gap: 4,
                animation: 'aiPulse 1.5s ease-in-out infinite',
              }}>
                <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} />
                Generating insights...
              </span>
            ) : data?.source && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
                {data.source === 'llm' ? 'AI-powered analysis' : 'Rule-based analysis'}
                {data.cached ? ' · cached' : ''}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing || loading || processing}
          style={{
            background: 'transparent',
            border: '1px solid var(--surface-border, rgba(255,255,255,0.15))',
            color: 'var(--text-secondary)',
            padding: '8px 12px', borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            cursor: refreshing || loading || processing ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem',
            opacity: refreshing || loading || processing ? 0.5 : 1,
          }}
          title="Regenerate insights"
        >
          <RefreshCw size={14} style={{ animation: refreshing || processing ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      {data?.summary && !loading && !processing && (
        <p style={{
          fontSize: '0.95rem', color: 'var(--text-primary)',
          marginBottom: 16, lineHeight: 1.5,
          padding: '12px 14px',
          background: 'rgba(139,92,246,0.08)',
          borderLeft: '3px solid #8b5cf6',
          borderRadius: 8,
        }}>
          {data.summary}
        </p>
      )}

      {/* Body */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <div key={i} className="ai-skeleton" style={{ height: 110 }} />)}
        </div>
      ) : processing ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: '40px 20px', color: 'var(--text-secondary)',
        }}>
          <Loader size={28} style={{ animation: 'spin 1.2s linear infinite', color: '#8b5cf6' }} />
          <p style={{ fontSize: '0.9rem', margin: 0 }}>
            Analyzing your financial data with AI...
          </p>
          <p style={{ fontSize: '0.78rem', margin: 0, opacity: 0.7 }}>
            This usually takes a few seconds
          </p>
        </div>
      ) : error ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{error}</p>
      ) : data?.insights?.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {data.insights.map((insight, idx) => (
            <InsightCard key={insight.id || idx} insight={insight} index={idx} />
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Keep tracking your expenses to unlock personalised insights.
        </p>
      )}
    </Card>
  );
};

export default AIInsightsPanel;

