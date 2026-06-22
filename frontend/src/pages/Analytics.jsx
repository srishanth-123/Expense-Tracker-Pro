import { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { TrendingUp, PieChart as PieChartIcon, Activity, ArrowUpRight, Flame, HeartPulse } from 'lucide-react';
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import ChartContainer from '../components/ui/ChartContainer';
import AIInsightsPanel from '../components/AIInsightsPanel';
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

const Analytics = () => {
  const { user } = useContext(AuthContext);
  const { theme } = useTheme();
  const [loading, setLoading] = useState(true);
  
  // Data states
  // eslint-disable-next-line no-unused-vars
  const [topExpenses, setTopExpenses] = useState([]);
  const [categoryTrend, setCategoryTrend] = useState({ labels: [], datasets: [] });
  const [insights, setInsights] = useState(null);
  const [heatmap, setHeatmap] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [incomeExpenseTrend, setIncomeExpenseTrend] = useState([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState([]);
  const [healthScore, setHealthScore] = useState(null);

  const currentDate = new Date();
  const [breakdownMonth, setBreakdownMonth] = useState(currentDate.getMonth() + 1);
  const [breakdownYear, setBreakdownYear] = useState(currentDate.getFullYear());

  const monthRef = useRef(currentDate.getMonth() + 1);
  const yearRef = useRef(currentDate.getFullYear());

  const fetchAnalytics = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [
        topRes,
        trendRes,
        insightsRes,
        heatmapRes,
        predRes,
        incExpRes,
        catBreakdownRes,
        healthScoreRes
      ] = await Promise.all([
        api.get('/analytics/top-expenses').catch(() => ({ data: [] })),
        api.get('/analytics/category-trend').catch(() => ({ data: { labels: [], datasets: [] } })),
        api.get('/analytics/insights').catch(() => ({ data: null })),
        api.get('/analytics/heatmap').catch(() => ({ data: [] })),
        api.get('/analytics/prediction').catch(() => ({ data: null })),
        api.get('/analytics/income-expense-trend').catch(() => ({ data: [] })),
        api.get(`/analytics/category?month=${monthRef.current}&year=${yearRef.current}`).catch(() => ({ data: [] })),
        api.get('/analytics/financial-health').catch(() => ({ data: null }))
      ]);

      setTopExpenses(topRes?.data || topRes || []);
      setCategoryTrend(trendRes?.data?.labels ? trendRes.data : trendRes?.labels ? trendRes : { labels: [], datasets: [] });
      setInsights(insightsRes?.data?.insights || insightsRes?.data?.insight ? insightsRes.data : insightsRes?.insights ? insightsRes : null);
      setHeatmap(heatmapRes?.data || heatmapRes || []);
      setPrediction(predRes?.data?.predictedExpense !== undefined ? predRes.data : predRes?.predictedExpense !== undefined ? predRes : null);
      setIncomeExpenseTrend(incExpRes?.data || incExpRes || []);
      setCategoryBreakdown(catBreakdownRes?.data || catBreakdownRes || []);
      setHealthScore(
        healthScoreRes?.score !== undefined 
          ? healthScoreRes 
          : (healthScoreRes?.data?.score !== undefined ? healthScoreRes.data : null)
      );
    } catch (error) {
      console.error("Failed to load analytics data:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const fetchCategoryBreakdown = useCallback(async (m, y) => {
    try {
      const res = await api.get(`/analytics/category?month=${m}&year=${y}`);
      setCategoryBreakdown(Array.isArray(res) ? res : res.data || []);
    } catch (error) {
      console.error("Failed to load category breakdown:", error);
    }
  }, []);

  const handleMonthChange = (e) => {
    const m = parseInt(e.target.value);
    setBreakdownMonth(m);
    monthRef.current = m;
    fetchCategoryBreakdown(m, breakdownYear);
  };

  const handleYearChange = (e) => {
    const y = parseInt(e.target.value);
    setBreakdownYear(y);
    yearRef.current = y;
    fetchCategoryBreakdown(breakdownMonth, y);
  };

  const userId = user?._id;

  useEffect(() => {
    if (userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAnalytics();
    }
  }, [userId, fetchAnalytics]);

  const updateTimer = useRef(null);
  useEffect(() => {
    const handleUpdate = () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      updateTimer.current = setTimeout(() => {
        if (userId) fetchAnalytics(true);
      }, 600);
    };
    window.addEventListener('financialDataUpdated', handleUpdate);
    return () => {
      window.removeEventListener('financialDataUpdated', handleUpdate);
      if (updateTimer.current) clearTimeout(updateTimer.current);
    };
  }, [userId, fetchAnalytics]);

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
  if (categoryTrend && Array.isArray(categoryTrend.labels) && Array.isArray(categoryTrend.datasets)) {
    categoryTrend.labels.forEach((label, index) => {
      const dataPoint = { name: label };
      categoryTrend.datasets.forEach(dataset => {
        if (dataset && Array.isArray(dataset.data)) {
          dataPoint[dataset.label] = dataset.data[index] || 0;
        }
      });
      trendData.push(dataPoint);
    });
  }

  const colors = ["var(--primary)", "var(--success)", "var(--warning)", "var(--danger)", "#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

  const hasData = trendData.length > 0 || heatmap.length > 0 || incomeExpenseTrend.length > 0 || healthScore;

  const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, percent, name }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="var(--text-primary)" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        fontSize={11}
        fontWeight={500}
      >
        {`${name} (${(percent * 100).toFixed(0)}%)`}
      </text>
    );
  };

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
              {user?.plan !== 'PRO' && !user?.isPro && <ProOverlay />}
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
                    <span style={{ color: 'var(--text-secondary)' }}>Current MTD: <strong style={{ color: 'var(--text-primary)' }}>₹{insights?.currentTotal?.toFixed(0)}</strong></span>
                    <span style={{ color: 'var(--surface-border)' }}>|</span>
                    <span style={{ color: 'var(--text-secondary)' }}>Prev MTD: <strong style={{ color: 'var(--text-primary)' }}>₹{insights?.prevTotal?.toFixed(0)}</strong></span>
                  </div>
                )}
              </div>
            </Card>

            {/* Predictive Analytics Card */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden' }}>
               {user?.plan !== 'PRO' && !user?.isPro && <ProOverlay />}
               <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--success)', opacity: 0.15, filter: 'blur(30px)', borderRadius: '50%' }}></div>
               <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <PieChartIcon size={20} color="var(--success)" />
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Projected Outflow (This Month)</h3>
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

            {/* Financial Health Score Gauge */}
            <Card style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', overflow: 'hidden', minHeight: '200px' }}>
              {user?.plan !== 'PRO' && !user?.isPro && <ProOverlay />}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <HeartPulse size={20} color="var(--danger)" />
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Financial Health</h3>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Score', value: healthScore?.score || 0 },
                          { name: 'Remaining', value: 100 - (healthScore?.score || 0) }
                        ]}
                        cx="50%" cy="100%"
                        startAngle={180} endAngle={0}
                        innerRadius={60} outerRadius={80}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="none"
                      >
                        <Cell fill={(healthScore?.score || 0) >= 80 ? 'var(--success)' : (healthScore?.score || 0) >= 60 ? 'var(--warning)' : 'var(--danger)'} />
                        <Cell fill="rgba(255,255,255,0.05)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ marginTop: '-40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{healthScore?.score || 0}</div>
                    <div style={{ fontSize: '0.9rem', color: (healthScore?.score || 0) >= 80 ? 'var(--success)' : (healthScore?.score || 0) >= 60 ? 'var(--warning)' : 'var(--danger)', fontWeight: 600 }}>
                      {healthScore?.status || 'No Score'}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Category Spending + Income vs Expenses — full-width, stacked vertically */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Category Breakdown Pie Chart */}
            <Card style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PieChartIcon size={18} /> Category Spending Breakdown
                </h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    value={breakdownMonth} 
                    onChange={handleMonthChange}
                    style={{ 
                      width: 'auto', 
                      padding: '6px 12px', 
                      fontSize: '0.85rem', 
                      borderRadius: '8px', 
                      background: 'var(--input-bg)', 
                      borderColor: 'var(--surface-border)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                  <select 
                    value={breakdownYear} 
                    onChange={handleYearChange}
                    style={{ 
                      width: 'auto', 
                      padding: '6px 12px', 
                      fontSize: '0.85rem', 
                      borderRadius: '8px', 
                      background: 'var(--input-bg)', 
                      borderColor: 'var(--surface-border)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    {[2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              {categoryBreakdown.length > 0 ? (
                <ChartContainer height={300}>
                  {({ width, height }) => (
                    <PieChart width={width} height={height}>
                      <Pie
                        data={categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={80}
                        innerRadius={45}
                        fill="#8884d8"
                        dataKey="total"
                        nameKey="category"
                        label={renderCustomizedLabel}
                      >
                        {categoryBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        wrapperStyle={{ zIndex: 1000 }}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                          borderRadius: '8px', 
                          color: theme === 'dark' ? '#fff' : '#0f172a' 
                        }}
                        formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Total Spent']}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    </PieChart>
                  )}
                </ChartContainer>
              ) : (
                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  No category spending recorded for this month.
                </div>
              )}
            </Card>

            {/* Monthly Income vs Expenses Trend Line */}
            <Card style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Activity size={18} /> Monthly Income vs Expenses
              </h3>
              {incomeExpenseTrend.length > 0 ? (
                <ChartContainer height={300}>
                  {({ width, height }) => (
                    <LineChart width={width} height={height} data={incomeExpenseTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'} vertical={false} />
                      <XAxis 
                        dataKey="name" 
                        stroke="var(--text-secondary)" 
                        fontSize={11} 
                        tickLine={false} 
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(val) => `₹${val.toLocaleString('en-IN')}`}
                      />
                      <RechartsTooltip 
                        wrapperStyle={{ zIndex: 1000 }}
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                          borderColor: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', 
                          borderRadius: '8px', 
                          color: theme === 'dark' ? '#fff' : '#0f172a' 
                        }}
                        formatter={(value) => `₹${value.toLocaleString('en-IN')}`}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line type="monotone" dataKey="income" name="Income" stroke="var(--success)" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4 }} />
                      <Line type="monotone" dataKey="expense" name="Expenses" stroke="var(--danger)" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4 }} />
                    </LineChart>
                  )}
                </ChartContainer>
              ) : (
                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                  Not enough monthly trend data.
                </div>
              )}
            </Card>

          </div>

          {/* Monthly Category Trends + Spending Intensity — side by side */}
          <div className="analytics-grid">

            {/* Monthly Category Trends */}
            <Card style={{ minWidth: 0, position: 'relative' }}>
              {user?.plan !== 'PRO' && !user?.isPro && <ProOverlay />}
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
                      
                      {Array.isArray(categoryTrend?.datasets) && categoryTrend.datasets.map((dataset, index) => (
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

            {/* 30-Day Spending Intensity */}
            <Card style={{ minWidth: 0, position: 'relative' }}>
              {user?.plan !== 'PRO' && !user?.isPro && <ProOverlay />}
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
