import React from 'react';
import { Download, FileSpreadsheet, CheckCircle, ShieldCheck } from 'lucide-react';

export default function ReportsPage() {
  const handleDownloadCSV = (workflowStatus) => {
    let url = '/api/reports/export-exceptions';
    if (workflowStatus) {
      url += `?workflowStatus=${workflowStatus}`;
    }
    window.open(url, '_blank');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      <div>
        <h1 className="text-3xl font-extrabold text-white">Reporting & Data Export</h1>
        <p className="text-slate-400 mt-1">
          Export reconciled transaction audit logs and exception management reports.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Export All Exceptions */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Full Exception Audit Log</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Export all detected exceptions (amount mismatches, missing bank/ledger entries, duplicates) including explainable error reasons.
            </p>
          </div>

          <button
            onClick={() => handleDownloadCSV('')}
            className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:scale-[1.02] transition-all"
          >
            <Download className="w-4 h-4" />
            Export All Exceptions (CSV)
          </button>
        </div>

        {/* Export Pending Only */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-white text-lg">Pending Exceptions Only</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Export unresolved exceptions requiring manual review by the Finance Operations team.
            </p>
          </div>

          <button
            onClick={() => handleDownloadCSV('PENDING')}
            className="mt-6 w-full py-3 rounded-xl bg-slate-800 text-amber-400 border border-amber-500/30 font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-700 transition-all"
          >
            <Download className="w-4 h-4" />
            Export Pending Queue (CSV)
          </button>
        </div>

      </div>
    </div>
  );
}
