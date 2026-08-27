const express = require('express');
const router = express.Router();
const Exception = require('../models/Exception');
const { Parser } = require('json2csv');

/**
 * GET /api/reports/export-exceptions
 * Download CSV report of exception queue with filter options
 */
router.get('/export-exceptions', async (req, res) => {
  try {
    const { sessionId, workflowStatus, status } = req.query;

    const filter = {};
    if (sessionId) filter.sessionId = sessionId;
    if (workflowStatus) filter.workflowStatus = workflowStatus;
    if (status) filter.reconciliationStatus = status;

    const exceptions = await Exception.find(filter).lean();

    if (!exceptions || exceptions.length === 0) {
      return res.status(404).json({ error: 'No exception records found for export' });
    }

    const fields = [
      'invoiceId',
      'bankTxnId',
      'ledgerTxnId',
      'vendor',
      'bankAmount',
      'ledgerAmount',
      'amountDiscrepancy',
      'bankDate',
      'ledgerDate',
      'reconciliationStatus',
      'workflowStatus',
      'exceptionReason',
      'controlAlerts',
      'resolutionNotes',
      'resolvedBy',
      'resolvedAt'
    ];

    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(exceptions);

    res.header('Content-Type', 'text/csv');
    res.attachment(`reconciliation-exceptions-${sessionId || 'all'}-${Date.now()}.csv`);
    return res.send(csv);

  } catch (err) {
    console.error('[Reports API] Export error:', err);
    res.status(500).json({ error: 'Failed to generate CSV export' });
  }
});

module.exports = router;
