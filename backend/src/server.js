const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const reconcileRoutes = require('./routes/reconcile');
const exceptionsRoutes = require('./routes/exceptions');
const reportsRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/reconcile', reconcileRoutes);
app.use('/api/exceptions', exceptionsRoutes);
app.use('/api/reports', reportsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'UP', 
    timestamp: new Date().toISOString(),
    mongoConnected: mongoose.connection.readyState === 1
  });
});

const ReconciliationSession = require('./models/ReconciliationSession');
const Exception = require('./models/Exception');
const { runReconciliationEngine } = require('./services/pythonRunner');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/finrecon';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('[MongoDB] Connected successfully to:', MONGO_URI);
    
    // Auto-seed benchmark demo session if database is empty
    try {
      const count = await ReconciliationSession.countDocuments();
      if (count === 0) {
        console.log('[MongoDB] No sessions found. Auto-seeding benchmark demo dataset...');
        const bankPath = path.resolve(__dirname, '../../data/test/bank_statement.csv');
        const ledgerPath = path.resolve(__dirname, '../../data/test/ledger.csv');
        
        if (fs.existsSync(bankPath) && fs.existsSync(ledgerPath)) {
          const sessionId = uuidv4();
          const result = await runReconciliationEngine(bankPath, ledgerPath, sessionId);
          
          const sessionDoc = new ReconciliationSession({
            sessionId: result.session_id || sessionId,
            bankFilename: 'bank_statement.csv (Benchmark Demo)',
            ledgerFilename: 'ledger.csv (Benchmark Demo)',
            summary: {
              totalTransactions: result.reconciliation_summary.total_transactions,
              matchedTransactions: result.reconciliation_summary.matched_transactions,
              unmatchedTransactions: result.reconciliation_summary.unmatched_transactions,
              exceptionCount: result.reconciliation_summary.exception_count,
              matchRatePct: result.reconciliation_summary.match_rate_pct,
              totalDiscrepancyUsd: result.reconciliation_summary.total_discrepancy_usd,
              bankTotalUsd: result.reconciliation_summary.bank_total_usd,
              ledgerTotalUsd: result.reconciliation_summary.ledger_total_usd,
              netDifferenceUsd: result.reconciliation_summary.net_difference_usd,
            },
            exceptionBreakdown: result.exception_breakdown,
            controlsSummary: {
              largeTransactions: result.controls_summary.large_transactions,
              duplicateInvoices: result.controls_summary.duplicate_invoices,
              missingReferences: result.controls_summary.missing_references,
              approvalRequired: result.controls_summary.approval_required,
              negativeAmounts: result.controls_summary.negative_amounts,
              roundAmountAnomalies: result.controls_summary.round_amount_anomalies,
              totalFlagged: result.controls_summary.total_flagged
            },
            charts: result.charts,
            loadSummary: result.load_summary
          });
          await sessionDoc.save();

          if (result.exceptions && result.exceptions.length > 0) {
            const exceptionDocs = result.exceptions.map(exc => ({
              sessionId: result.session_id || sessionId,
              invoiceId: exc.invoice_id || '',
              bankTxnId: exc.bank_txn_id || '',
              ledgerTxnId: exc.ledger_txn_id || '',
              vendor: exc.vendor || 'Unknown',
              bankAmount: exc.bank_amount,
              ledgerAmount: exc.ledger_amount,
              bankDate: exc.bank_date || '',
              ledgerDate: exc.ledger_date || '',
              referenceId: exc.reference_id || '',
              department: exc.department || '',
              category: exc.category || '',
              description: exc.description || '',
              reconciliationStatus: exc.reconciliation_status,
              exceptionReason: exc.exception_reason,
              amountDiscrepancy: exc.amount_discrepancy || 0,
              dateDiscrepancyDays: exc.date_discrepancy_days || 0,
              isLargeTransaction: exc.is_large_transaction || false,
              isDuplicateInvoice: exc.is_duplicate_invoice || false,
              isMissingReference: exc.is_missing_reference || false,
              isApprovalRequired: exc.is_approval_required || false,
              isNegativeAmount: exc.is_negative_amount || false,
              isRoundAmountAnomaly: exc.is_round_amount_anomaly || false,
              hasControlFlag: exc.has_control_flag || false,
              controlAlerts: exc.control_alerts || '',
              workflowStatus: 'PENDING'
            }));
            await Exception.insertMany(exceptionDocs);
          }
          console.log('[MongoDB] Auto-seeding complete! Benchmark demo session created.');
        }
      }
    } catch (seedErr) {
      console.warn('[MongoDB] Auto-seeding warning:', seedErr.message);
    }
  })
  .catch((err) => {
    console.warn('[MongoDB] Warning: Could not connect to local MongoDB. (API endpoints will function, but session history requires MongoDB).', err.message);
  });

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  Finance Operations API Server running on port ${PORT}`);
  console.log(`  Health Check: http://localhost:${PORT}/api/health`);
  console.log(`====================================================`);
});
