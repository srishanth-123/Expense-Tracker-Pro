import { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  AreaChart, Area
} from 'recharts';
import { TrendingUp, PieChart as PieChartIcon, Activity, ArrowUpRight, Flame } from 'lucide-react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ChartContainer from '../components/ui/ChartContainer';
import AIInsightsPanel from '../components/AIInsightsPanel';

const Analytics = () => {
  const { user } = useContext(AuthContext);
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [topExpenses, setTopExpenses] = useState([]);
  const [categoryTrend, setCategoryTrend] = useState({ labels: [], datasets: [] });
  const [insights, setInsights] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [prediction, setPrediction] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      const [
        topRes,
        trendRes,
        insightsRes,
        heatmapRes,
        predRes
      ] = await Promise.all([
        api.get('/analytics/top-expenses'),
        api.get('/analytics/category-trend'),
        api.get('/analytics/insights'),
        api.get('/analytics/heatmap'),
        api.get('/analytics/prediction')
      ]);

      setTopExpenses(Array.isArray(topRes) ? topRes : topRes.data || []);
      setCategoryTrend(trendRes.labels ? trendRes : trendRes.data || { labels: [], datasets: [] });
      setInsights(insightsRes.insights || insightsRes.insight ? insightsRes : null);
      setHeatmap(Array.isArray(heatmapRes) ? heatmapRes : heatmapRes.data || []);
      setPrediction(predRes.predictedExpense !== undefined ? predRes : null);
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchAnalytics();
    }
  }, [user, fetchAnalytics]);

  useEffect(() => {
    const handleUpdate = () => {
      if (user) fetchAnalytics();
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => window.removeEventListener('financialDataUpdated', handleUpdate);
  }, [user, fetchAnalytics]);

  if (loading) {
    return (
      <SkeletonTheme 
        baseColor={theme === 'dark' ? 'rgba(30, 41, 59, 0.5)' : 'rgba(0, 0, 0, 0.05)'} 
        highlightColor={theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.1)'}
      >
        <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <Skeleton height={40} width={300} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <Skeleton height={180} borderRadius={16} />
            <Skeleton height={180} borderRadius={16} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            <Skeleton height={400} borderRadius={16} />
            <Skeleton height={400} borderRadius={16} />
          </div>
        </div>
      </SkeletonTheme>
    );
  }

  const trendData = [];
  if (categoryTrend && categoryTrend.labels) {
    categoryTrend.labels.forEach((label, index) => {
      const dataPoint = { name: label };
      categoryTrend.datasets.forEach(dataset => {
        dataPoint[dataset.label] = dataset.data[index] || 0;
      });
      trendData.push(dataPoint);
    });
  }

  const colors = ["#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

  const hasData = trendData.length > 0 || heatmap.length > 0;

  return (
    <div className="animate-fade-in" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <div style={{ background: 'var(--primary)', padding: '10px', borderRadius: '12px', color: 'white' }}>
          <TrendingUp size={24} />
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>Advanced Analytics</h1>
      </div>

      {!hasData ? (
        <EmptyState 
          icon={Activity}
          title="No Analytics Data Yet"
          description="We need more transaction data to generate meaningful insights and charts."
        />
      ) : (
        <>
          {/* AI Financial Insights — animated, LLM-generated */}
          <AIInsightsPanel />

          {/* Top Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            
            {/* Smart Insights Card */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--primary)', opacity: 0.2, filter: 'blur(30px)', borderRadius: '50%' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Activity size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Smart Insights</h3>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' }}>
                {insights?.insights ? (
                  insights.insights.slice(0, 2).map((ins, i) => (
                    <p key={i} style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>
                      • {ins}
                    </p>
                  ))
                ) : (
                  <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>
                    {insights?.insight || "Not enough data yet."}
                  </p>
                )}
                {insights?.prevTotal > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Current MTD: <strong style={{ color: 'var(--text-primary)' }}>₹{insights.currentTotal.toFixed(0)}</strong></span>
                    <span style={{ color: 'var(--surface-border)' }}>|</span>
                    <span style={{ color: 'var(--text-secondary)' }}>Prev MTD: <strong style={{ color: 'var(--text-primary)' }}>₹{insights.prevTotal.toFixed(0)}</strong></span>
                  </div>
                )}
              </div>
            </Card>

            {/* Predictive Analytics Card */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden' }}>
               <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--success)', opacity: 0.15, filter: 'blur(30px)', borderRadius: '50%' }}></div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <PieChartIcon size={20} color="var(--success)" />
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>AI Projection (This Month)</h3>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    ₹{prediction?.predictedExpense?.toLocaleString() || '0'}
                  </span>
                  <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600 }}>
                    <ArrowUpRight size={16} /> Projected
                  </span>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  Based on your 3-month rolling average.
                </p>
              </div>
            </Card>
          </div>

          {/* Charts Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            
            {/* Category Trend Chart */}
            <Card style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} /> Monthly Category Trends
              </h3>
              {trendData.length > 0 ? (
                <ChartContainer height={300}>
                  {({ width, height }) => (
                    <BarChart width={width} height={height} data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="var(--text-secondary)" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                      <RechartsTooltip 
                        wrapperStyle={{ zIndex: 1000 }}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                          borderRadius: '8px', 
                          color: theme === 'dark' ? '#fff' : '#0f172a' 
                        }}
                        labelStyle={{ color: theme === 'dark' ? '#fff' : '#0f172a', fontWeight: 'bold' }}
                        itemStyle={{ color: theme === 'dark' ? '#fff' : '#0f172a' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      
                      {categoryTrend.datasets && categoryTrend.datasets.map((dataset, index) => (
                        <Bar 
                          key={dataset.label} 
                          dataKey={dataset.label} 
                          stackId="a" 
                          fill={colors[index % colors.length]} 
                          radius={[index === categoryTrend.datasets.length - 1 ? 4 : 0, index === categoryTrend.datasets.length - 1 ? 4 : 0, 0, 0]}
                        />
                    ))}
                  </BarChart>
                  )}
                </ChartContainer>
              ) : (
                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  Not enough data for category trends.
                </div>
              )}
            </Card>

            {/* Spending Heatmap (Area Chart substitute) */}
            <Card style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={18} /> 30-Day Spending Intensity
              </h3>
              {heatmap.length > 0 ? (
                <ChartContainer height={300}>
                  {({ width, height }) => (
                    <AreaChart width={width} height={height} data={heatmap} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <defs>
                        <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                      <XAxis 
                        dataKey="_id" 
                        stroke="var(--text-secondary)" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                        interval="preserveStartEnd"
                        tickFormatter={(val) => {
                          // val is YYYY-MM-DD
                          const d = new Date(val);
                          return `${d.getDate()}/${d.getMonth() + 1}`;
                        }}
                      />
                      <YAxis 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => `₹${val}`}
                        width={50}
                      />
                      <RechartsTooltip 
                        wrapperStyle={{ zIndex: 1000 }}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                          borderRadius: '8px', 
                          color: theme === 'dark' ? '#fff' : '#0f172a' 
                        }}
                        labelStyle={{ color: theme === 'dark' ? '#fff' : '#0f172a', fontWeight: 'bold' }}
                        itemStyle={{ color: theme === 'dark' ? '#fff' : '#0f172a' }}
                        labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      />
                      <Area type="monotone" dataKey="total" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorAmount)" />
                    </AreaChart>
                  )}
                </ChartContainer>
              ) : (
                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  Not enough daily data for heatmap.
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Analytics;
