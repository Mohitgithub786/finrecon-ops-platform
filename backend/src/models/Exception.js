const mongoose = require('mongoose');

const ExceptionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  invoiceId: { type: String, default: '' },
  bankTxnId: { type: String, default: '' },
  ledgerTxnId: { type: String, default: '' },
  vendor: { type: String, default: 'Unknown' },
  bankAmount: { type: Number, default: null },
  ledgerAmount: { type: Number, default: null },
  bankDate: { type: String, default: '' },
  ledgerDate: { type: String, default: '' },
  referenceId: { type: String, default: '' },
  department: { type: String, default: '' },
  category: { type: String, default: '' },
  description: { type: String, default: '' },
  
  reconciliationStatus: { 
    type: String, 
    required: true,
    enum: ['MATCHED', 'AMOUNT_MISMATCH', 'DATE_MISMATCH', 'MISSING_BANK', 'MISSING_LEDGER', 'DUPLICATE']
  },
  
  exceptionReason: { type: String, required: true },
  amountDiscrepancy: { type: Number, default: 0 },
  dateDiscrepancyDays: { type: Number, default: 0 },

  // Control Flags
  isLargeTransaction: { type: Boolean, default: false },
  isDuplicateInvoice: { type: Boolean, default: false },
  isMissingReference: { type: Boolean, default: false },
  isApprovalRequired: { type: Boolean, default: false },
  isNegativeAmount: { type: Boolean, default: false },
  isRoundAmountAnomaly: { type: Boolean, default: false },
  hasControlFlag: { type: Boolean, default: false },
  controlAlerts: { type: String, default: '' },

  // Exception Workflow Management
  workflowStatus: { 
    type: String, 
    enum: ['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'],
    default: 'PENDING',
    index: true
  },
  assignedTo: { type: String, default: '' },
  resolutionNotes: { type: String, default: '' },
  resolvedBy: { type: String, default: '' },
  resolvedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Exception', ExceptionSchema);
