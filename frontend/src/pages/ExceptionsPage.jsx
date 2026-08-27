import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  AlertTriangle, Filter, Search, CheckCircle2, XCircle, Clock, 
  ChevronRight, ArrowUpDown, FileText, Check, ShieldAlert 
} from 'lucide-react';

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedException, setSelectedException] = useState(null);

  // Filters state
  const [statusFilter, setStatusFilter] = useState('');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const fetchExceptions = () => {
    setLoading(true);
    axios.get('/api/exceptions', {
      params: {
        status: statusFilter || undefined,
        workflowStatus: workflowFilter || undefined,
        search: searchQuery || undefined,
        limit: 100
      }
    })
    .then(res => setExceptions(res.data.exceptions || []))
    .catch(err => console.error('Failed to fetch exceptions:', err))
    .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExceptions();
  }, [statusFilter, workflowFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchExceptions();
  };

  const handleUpdateStatus = (id, newStatus) => {
    axios.patch(`/api/exceptions/${id}/status`, {
      workflowStatus: newStatus,
      resolutionNotes: resolutionNotes,
      resolvedBy: 'Finance Ops Analyst'
    })
    .then(res => {
      setExceptions(prev => prev.map(item => item._id === id ? res.data.exception : item));
      if (selectedException && selectedException._id === id) {
        setSelectedException(res.data.exception);
      }
      setResolutionNotes('');
    })
    .catch(err => console.error('Update status failed:', err));
  };

  const getStatusBadge = (status) => {
    const map = {
      AMOUNT_MISMATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      DATE_MISMATCH: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      MISSING_BANK: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      MISSING_LEDGER: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
      DUPLICATE: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    };
    return (
      <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${map[status] || 'bg-slate-800 text-slate-400'}`}>
        {status}
      </span>
    );
  };

  const getWorkflowBadge = (status) => {
    const map = {
      PENDING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      IN_REVIEW: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
      RESOLVED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      REJECTED: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${map[status] || 'bg-slate-800 text-slate-400'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 py-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white">Exception Management Queue</h1>
        <p className="text-slate-400 mt-1">
          Review automated reconciliation exceptions, explainable error reasons, and audit workflow status.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="w-full md:w-80 relative">
          <input
            type="text"
            placeholder="Search invoice, vendor, or reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
        </form>

        {/* Filters */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Exception Types</option>
            <option value="AMOUNT_MISMATCH">Amount Mismatch</option>
            <option value="DATE_MISMATCH">Date Mismatch</option>
            <option value="MISSING_BANK">Missing Bank</option>
            <option value="MISSING_LEDGER">Missing Ledger</option>
            <option value="DUPLICATE">Duplicate</option>
          </select>

          <select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="">All Workflow Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>

      </div>

      {/* Main Grid: List + Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Exceptions Table */}
        <div className="lg:col-span-2 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading exceptions...</div>
          ) : exceptions.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No exceptions match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-3.5">Invoice / Vendor</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5">Bank vs Ledger</th>
                    <th className="p-3.5">Workflow</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {exceptions.map((exc) => (
                    <tr
                      key={exc._id}
                      onClick={() => setSelectedException(exc)}
                      className={`cursor-pointer hover:bg-slate-800/50 transition-colors ${
                        selectedException?._id === exc._id ? 'bg-cyan-500/10' : ''
                      }`}
                    >
                      <td className="p-3.5">
                        <span className="font-bold text-white block font-mono">{exc.invoiceId || 'NO-REF'}</span>
                        <span className="text-slate-400 text-[11px] block">{exc.vendor}</span>
                      </td>

                      <td className="p-3.5">
                        {getStatusBadge(exc.reconciliationStatus)}
                      </td>

                      <td className="p-3.5 font-mono">
                        <span className="text-cyan-400 block">Bank: {exc.bankAmount != null ? `$${exc.bankAmount.toFixed(2)}` : 'N/A'}</span>
                        <span className="text-purple-400 block">Ldg: {exc.ledgerAmount != null ? `$${exc.ledgerAmount.toFixed(2)}` : 'N/A'}</span>
                      </td>

                      <td className="p-3.5">
                        {getWorkflowBadge(exc.workflowStatus)}
                      </td>

                      <td className="p-3.5 text-right">
                        <button className="text-slate-400 hover:text-cyan-400 p-1">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Exception Detail Panel */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between">
          {selectedException ? (
            <div className="space-y-6">
              <div>
                <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">Exception Audit Details</span>
                <h3 className="text-xl font-bold text-white font-mono mt-0.5">{selectedException.invoiceId || 'NO-REF'}</h3>
                <p className="text-xs text-slate-400">{selectedException.vendor} • {selectedException.category || 'General'}</p>
              </div>

              {/* Explainable Reason Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Explainable Exception Reason
                </span>
                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                  {selectedException.exceptionReason}
                </p>
              </div>

              {/* Control Alerts if any */}
              {selectedException.hasControlFlag && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{selectedException.controlAlerts}</span>
                </div>
              )}

              {/* Workflow Status Action */}
              <div className="space-y-3 pt-4 border-t border-slate-800">
                <span className="text-xs font-bold text-slate-200 block">Resolution Workflow Action</span>
                
                <textarea
                  rows="3"
                  placeholder="Add resolution notes or rationale..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500 resize-none"
                ></textarea>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedException._id, 'RESOLVED')}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Mark Resolved
                  </button>

                  <button
                    onClick={() => handleUpdateStatus(selectedException._id, 'IN_REVIEW')}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition-all"
                  >
                    Under Review
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-slate-500 text-sm">
              Select an exception from the queue to inspect details & resolve.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
