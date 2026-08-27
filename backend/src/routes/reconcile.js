const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { runReconciliationEngine } = require('../services/pythonRunner');
const ReconciliationSession = require('../models/ReconciliationSession');
const Exception = require('../models/Exception');

// Configure Multer storage
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

/**
 * POST /api/reconcile/upload-and-run
 * Upload bank and ledger CSVs and trigger Python reconciliation engine
 */
router.post('/upload-and-run', upload.fields([
  { name: 'bank', maxCount: 1 },
  { name: 'ledger', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.bank || !req.files.ledger) {
      return res.status(400).json({ error: 'Both bank and ledger CSV files are required.' });
    }

    const bankFile = req.files.bank[0];
    const ledgerFile = req.files.ledger[0];
    const sessionId = uuidv4();

    console.log(`[API] Triggering reconciliation session ${sessionId}...`);

    // Execute Python Engine
    const result = await runReconciliationEngine(bankFile.path, ledgerFile.path, sessionId);

    // Save Session to MongoDB
    const sessionDoc = new ReconciliationSession({
      sessionId: result.session_id || sessionId,
      bankFilename: bankFile.originalname,
      ledgerFilename: ledgerFile.originalname,
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

    // Bulk Insert Exception Documents into MongoDB
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

    res.status(200).json({
      message: 'Reconciliation completed successfully',
      sessionId: result.session_id || sessionId,
      summary: sessionDoc.summary,
      exceptionBreakdown: sessionDoc.exceptionBreakdown,
      controlsSummary: sessionDoc.controlsSummary,
      charts: sessionDoc.charts
    });

  } catch (err) {
    console.error('[API] Error running reconciliation:', err);
    res.status(500).json({ error: err.message || 'Server error during reconciliation' });
  }
});

/**
 * POST /api/reconcile/run-demo
 * Run reconciliation directly on pre-generated demo benchmark CSVs
 */
router.post('/run-demo', async (req, res) => {
  try {
    const bankPath = path.resolve(__dirname, '../../../data/test/bank_statement.csv');
    const ledgerPath = path.resolve(__dirname, '../../../data/test/ledger.csv');
    const sessionId = uuidv4();

    if (!fs.existsSync(bankPath) || !fs.existsSync(ledgerPath)) {
      return res.status(404).json({ error: 'Demo benchmark dataset files not found. Run generate_test_data.py first.' });
    }

    console.log(`[API] Running demo reconciliation session ${sessionId}...`);

    // Execute Python Engine
    const result = await runReconciliationEngine(bankPath, ledgerPath, sessionId);

    // Save Session to MongoDB
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

    // Bulk Insert Exception Documents into MongoDB
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

    res.status(200).json({
      message: 'Demo reconciliation completed successfully',
      sessionId: result.session_id || sessionId,
      summary: sessionDoc.summary,
      exceptionBreakdown: sessionDoc.exceptionBreakdown,
      controlsSummary: sessionDoc.controlsSummary,
      charts: sessionDoc.charts
    });

  } catch (err) {
    console.error('[API] Error running demo reconciliation:', err);
    res.status(500).json({ error: err.message || 'Server error during demo reconciliation' });
  }
});

/**
 * GET /api/reconcile/sessions
 * List recent reconciliation sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await ReconciliationSession.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select('sessionId createdAt bankFilename ledgerFilename summary controlsSummary');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

/**
 * GET /api/reconcile/session/:sessionId
 * Fetch full dashboard data for a given session
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await ReconciliationSession.findOne({ sessionId: req.params.sessionId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Count current status of exceptions (to reflect real-time resolutions)
    const pendingCount = await Exception.countDocuments({ sessionId: req.params.sessionId, workflowStatus: 'PENDING' });
    const inReviewCount = await Exception.countDocuments({ sessionId: req.params.sessionId, workflowStatus: 'IN_REVIEW' });
    const resolvedCount = await Exception.countDocuments({ sessionId: req.params.sessionId, workflowStatus: 'RESOLVED' });

    res.json({
      session,
      workflowCounts: {
        pending: pendingCount,
        inReview: inReviewCount,
        resolved: resolvedCount,
        total: session.summary.exceptionCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch session details' });
  }
});

module.exports = router;
