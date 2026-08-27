const mongoose = require('mongoose');

const ReconciliationSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  bankFilename: { type: String, required: true },
  ledgerFilename: { type: String, required: true },
  
  summary: {
    totalTransactions: { type: Number, default: 0 },
    matchedTransactions: { type: Number, default: 0 },
    unmatchedTransactions: { type: Number, default: 0 },
    exceptionCount: { type: Number, default: 0 },
    matchRatePct: { type: Number, default: 0 },
    totalDiscrepancyUsd: { type: Number, default: 0 },
    bankTotalUsd: { type: Number, default: 0 },
    ledgerTotalUsd: { type: Number, default: 0 },
    netDifferenceUsd: { type: Number, default: 0 },
  },

  exceptionBreakdown: [{
    status: String,
    count: Number,
    totalDiscrepancy: Number
  }],

  controlsSummary: {
    largeTransactions: { type: Number, default: 0 },
    duplicateInvoices: { type: Number, default: 0 },
    missingReferences: { type: Number, default: 0 },
    approvalRequired: { type: Number, default: 0 },
    negativeAmounts: { type: Number, default: 0 },
    roundAmountAnomalies: { type: Number, default: 0 },
    totalFlagged: { type: Number, default: 0 }
  },

  charts: { type: Object, default: {} },

  loadSummary: Object
}, { timestamps: true });

module.exports = mongoose.model('ReconciliationSession', ReconciliationSessionSchema);
