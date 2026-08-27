import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import KPICard from '../components/KPICard';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { 
  CheckCircle, AlertTriangle, DollarSign, Percent, FileCheck, ShieldAlert, 
  ArrowUpRight, RefreshCw, Layers 
} from 'lucide-react';

const STATUS_COLORS = {
  MATCHED: '#10b981',
  AMOUNT_MISMATCH: '#f59e0b',
  DATE_MISMATCH: '#3b82f6',
  MISSING_BANK: '#ef4444',
  MISSING_LEDGER: '#ec4899',
  DUPLICATE: '#8b5cf6'
};

export default function DashboardPage({ currentSession }) {
  const location = useLocation();
  const [data, setData] = useState(location.state?.sessionData || currentSession || null);
  const [loading, setLoading] = useState(!data);

  useEffect(() => {
    if (!data) {
      // Try to fetch latest session from API
      axios.get('/api/reconcile/sessions')
        .then(res => {
          if (res.data && res.data.length > 0) {
            const latestSessionId = res.data[0].sessionId;
            return axios.get(`/api/reconcile/session/${latestSessionId}`);
          }
        })
        .then(res => {
          if (res && res.data) {
            setData({
              reconciliation_summary: res.data.session.summary,
              exception_breakdown: res.data.session.exceptionBreakdown,
              controls_summary: res.data.session.controlsSummary,
              charts: res.data.session.charts,
              session_id: res.data.session.sessionId
            });
          }
        })
        .catch(err => console.error('Failed to load session:', err))
        .finally(() => setLoading(false));
    }
  }, []);

  const handleRunDemo = () => {
    setLoading(true);
    axios.post('/api/reconcile/run-demo')
      .then(res => {
        setData({
          reconciliation_summary: res.data.summary,
          exception_breakdown: res.data.exceptionBreakdown,
          controls_summary: res.data.controlsSummary,
          charts: res.data.charts,
          session_id: res.data.sessionId
        });
      })
      .catch(err => console.error('Failed to run demo:', err))
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-medium text-sm">Processing Reconciliation Engine...</p>
      </div>
    );
  }

  if (!data || !data.reconciliation_summary) {
    return (
      <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-xl mx-auto my-12">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-4">
          <Layers className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">No Active Reconciliation Session</h2>
        <p className="text-slate-400 text-sm mb-6">
          Upload custom bank and ledger CSV files, or click below to run 1-click benchmark demo data.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleRunDemo}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 hover:scale-105 transition-all flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Run Benchmark Demo Data
          </button>

          <Link
            to="/upload"
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold text-sm border border-slate-700 transition-all flex items-center justify-center gap-2"
          >
            Upload Custom CSVs
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  const s = data.reconciliation_summary;
  const c = data.controls_summary || {};
  const charts = data.charts || {};

  return (
    <div className="space-y-8 py-4">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Reconciliation Engine Active
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Finance Operations Dashboard</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-mono">
            Session ID: {data.session_id}
          </p>
        </div>

        <Link
          to="/exceptions"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 text-sm font-bold transition-all"
        >
          Review Exceptions Queue ({s.exception_count})
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <KPICard
          title="Total Transactions"
          value={s.total_transactions?.toLocaleString()}
          subtext={`Bank: $${(s.bank_total_usd/1e6).toFixed(2)}M | Ledger: $${(s.ledger_total_usd/1e6).toFixed(2)}M`}
          icon={FileCheck}
          color="cyan"
        />

        <KPICard
          title="Match Rate"
          value={`${s.match_rate_pct}%`}
          subtext={`${s.matched_transactions?.toLocaleString()} Matched Cleanly`}
          icon={Percent}
          color="emerald"
        />

        <KPICard
          title="Total Discrepancy"
          value={`$${s.total_discrepancy_usd?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          subtext={`${s.exception_count} Total Exceptions Detected`}
          icon={DollarSign}
          color="rose"
        />

        <KPICard
          title="Financial Controls Flagged"
          value={c.total_flagged || 0}
          subtext={`Includes Large & Duplicate Items`}
          icon={ShieldAlert}
          color="amber"
        />
      </div>

      {/* Charts Row 1: Trend & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Daily Matching Trend */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-white text-lg">Daily Reconciliation Volume</h3>
              <p className="text-xs text-slate-400">Matched vs Exceptions over transaction timeframe</p>
            </div>
          </div>
          
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={charts.trend_by_day || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff' }}
                />
                <Legend />
                <Bar dataKey="matched" name="Matched" fill="#10b981" radius={[4, 4, 0, 0]} stackId="a" />
                <Bar dataKey="exceptions" name="Exceptions" fill="#ef4444" radius={[4, 4, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status Breakdown Pie */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-white text-lg mb-1">Status Distribution</h3>
            <p className="text-xs text-slate-400 mb-4">Breakdown by status category</p>
          </div>

          <div className="h-56 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charts.status_distribution || []}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={4}
                >
                  {(charts.status_distribution || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Status Legend List */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
            {(data.exception_breakdown || []).map((item) => (
              <div key={item.status} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[item.status] }}></span>
                <span className="text-slate-300 font-medium truncate">{item.status}: <strong className="text-white">{item.count}</strong></span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Financial Controls Table */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <h3 className="font-bold text-white text-lg mb-4 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-amber-400" />
          Financial Control Policy Violations
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Large Transactions</span>
            <span className="text-xl font-bold text-amber-400 mt-1 block font-mono">{c.large_transactions || 0}</span>
            <span className="text-[10px] text-slate-500">Above $10,000 threshold</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Duplicate Invoices</span>
            <span className="text-xl font-bold text-purple-400 mt-1 block font-mono">{c.duplicate_invoices || 0}</span>
            <span className="text-[10px] text-slate-500">Double-entry detection</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Missing References</span>
            <span className="text-xl font-bold text-rose-400 mt-1 block font-mono">{c.missing_references || 0}</span>
            <span className="text-[10px] text-slate-500">No PO/invoice ID</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Approval Required</span>
            <span className="text-xl font-bold text-cyan-400 mt-1 block font-mono">{c.approval_required || 0}</span>
            <span className="text-[10px] text-slate-500">Manager sign-off (&gt;$25k)</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Negative Amounts</span>
            <span className="text-xl font-bold text-emerald-400 mt-1 block font-mono">{c.negative_amounts || 0}</span>
            <span className="text-[10px] text-slate-500">Refund/reversals</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 block font-medium">Total Flagged</span>
            <span className="text-xl font-bold text-white mt-1 block font-mono">{c.total_flagged || 0}</span>
            <span className="text-[10px] text-slate-500">Policy audit queue</span>
          </div>
        </div>
      </div>
    </div>
  );
}
