import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight, Loader2, Play } from 'lucide-react';

export default function UploadPage({ onReconciliationSuccess }) {
  const [bankFile, setBankFile] = useState(null);
  const [ledgerFile, setLedgerFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleRunReconciliation = async () => {
    if (!bankFile || !ledgerFile) {
      setError('Please select both Bank Statement and Ledger CSV files.');
      return;
    }

    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('bank', bankFile);
    formData.append('ledger', ledgerFile);

    try {
      const res = await axios.post('/api/reconcile/upload-and-run', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (onReconciliationSuccess) {
        onReconciliationSuccess(res.data);
      }

      navigate('/', { state: { sessionData: res.data } });
    } catch (err) {
      console.error('Reconciliation error:', err);
      setError(err.response?.data?.error || 'Failed to run reconciliation process.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemoFiles = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await axios.post('/api/reconcile/run-demo');
      if (onReconciliationSuccess) {
        onReconciliationSuccess(res.data);
      }
      navigate('/', { state: { sessionData: res.data } });
    } catch (err) {
      console.error('Demo reconciliation error:', err);
      setError(err.response?.data?.error || 'Failed to run demo benchmark data.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-white">Import & Reconcile Data</h1>
        <p className="text-slate-400 mt-1">
          Upload bank statement CSV and company ledger CSV to run automated 6-pass reconciliation.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {/* Upload Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Bank CSV Card */}
        <div className={`p-6 rounded-2xl border transition-all ${bankFile ? 'bg-cyan-950/20 border-cyan-500/40' : 'bg-slate-900 border-slate-800'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white">1. Bank Statement CSV</h3>
                <span className="text-xs text-slate-400">External Bank Record</span>
              </div>
            </div>
            {bankFile && <CheckCircle2 className="w-6 h-6 text-cyan-400" />}
          </div>

          <label className="block cursor-pointer">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setBankFile(e.target.files[0])}
            />
            <div className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 rounded-xl p-6 text-center transition-colors">
              <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              {bankFile ? (
                <div>
                  <span className="text-sm font-semibold text-cyan-400 block">{bankFile.name}</span>
                  <span className="text-xs text-slate-500">{(bankFile.size / 1024).toFixed(1)} KB • Click to change</span>
                </div>
              ) : (
                <div>
                  <span className="text-sm text-slate-300 font-medium block">Choose Bank CSV File</span>
                  <span className="text-xs text-slate-500">Must include: date, invoice_id, amount</span>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Ledger CSV Card */}
        <div className={`p-6 rounded-2xl border transition-all ${ledgerFile ? 'bg-purple-950/20 border-purple-500/40' : 'bg-slate-900 border-slate-800'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white">2. Company Ledger CSV</h3>
                <span className="text-xs text-slate-400">Internal ERP Record</span>
              </div>
            </div>
            {ledgerFile && <CheckCircle2 className="w-6 h-6 text-purple-400" />}
          </div>

          <label className="block cursor-pointer">
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setLedgerFile(e.target.files[0])}
            />
            <div className="border-2 border-dashed border-slate-700 hover:border-purple-500/50 rounded-xl p-6 text-center transition-colors">
              <UploadCloud className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              {ledgerFile ? (
                <div>
                  <span className="text-sm font-semibold text-purple-400 block">{ledgerFile.name}</span>
                  <span className="text-xs text-slate-500">{(ledgerFile.size / 1024).toFixed(1)} KB • Click to change</span>
                </div>
              ) : (
                <div>
                  <span className="text-sm text-slate-300 font-medium block">Choose Ledger CSV File</span>
                  <span className="text-xs text-slate-500">Must include: date, invoice_id, amount</span>
                </div>
              )}
            </div>
          </label>
        </div>

      </div>

      {/* Action Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h4 className="font-bold text-white">Ready to Reconcile?</h4>
          <p className="text-xs text-slate-400">
            Python engine will execute 6-pass matching, financial controls checks, and reason generation.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleLoadDemoFiles}
            disabled={loading}
            className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold text-sm border border-slate-700 transition-all flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4 fill-current text-cyan-400" />
            <span>Run Benchmark Demo Data</span>
          </button>

          <button
            onClick={handleRunReconciliation}
            disabled={loading || !bankFile || !ledgerFile}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-lg ${
              loading || !bankFile || !ledgerFile
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/25 hover:scale-105'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Run Uploaded CSVs</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
