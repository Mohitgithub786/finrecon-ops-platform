const express = require('express');
const router = express.Router();
const Exception = require('../models/Exception');

/**
 * GET /api/exceptions
 * Query exception records with pagination & filters
 */
router.get('/', async (req, res) => {
  try {
    const { 
      sessionId, 
      status, 
      workflowStatus, 
      department, 
      category, 
      search,
      hasControlFlag,
      page = 1, 
      limit = 50 
    } = req.query;

    const filter = {};

    if (sessionId) filter.sessionId = sessionId;
    if (status) filter.reconciliationStatus = status;
    if (workflowStatus) filter.workflowStatus = workflowStatus;
    if (department) filter.department = department;
    if (category) filter.category = category;
    if (hasControlFlag === 'true') filter.hasControlFlag = true;

    if (search) {
      filter.$or = [
        { invoiceId: { $regex: search, $options: 'i' } },
        { vendor: { $regex: search, $options: 'i' } },
        { referenceId: { $regex: search, $options: 'i' } },
        { exceptionReason: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const exceptions = await Exception.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Exception.countDocuments(filter);

    res.json({
      exceptions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('[Exceptions API] Error fetching exceptions:', err);
    res.status(500).json({ error: 'Failed to fetch exceptions' });
  }
});

/**
 * GET /api/exceptions/:id
 * Get single exception details
 */
router.get('/:id', async (req, res) => {
  try {
    const exception = await Exception.findById(req.params.id);
    if (!exception) return res.status(404).json({ error: 'Exception not found' });
    res.json(exception);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exception' });
  }
});

/**
 * PATCH /api/exceptions/:id/status
 * Update workflow status of an exception & add resolution notes
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { workflowStatus, resolutionNotes, resolvedBy } = req.body;

    if (!['PENDING', 'IN_REVIEW', 'RESOLVED', 'REJECTED'].includes(workflowStatus)) {
      return res.status(400).json({ error: 'Invalid workflow status' });
    }

    const updateData = {
      workflowStatus,
      resolutionNotes: resolutionNotes || '',
      updatedAt: new Date()
    };

    if (workflowStatus === 'RESOLVED') {
      updateData.resolvedBy = resolvedBy || 'Finance Analyst';
      updateData.resolvedAt = new Date();
    }

    const exception = await Exception.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!exception) return res.status(404).json({ error: 'Exception not found' });

    res.json({
      message: 'Exception workflow status updated',
      exception
    });
  } catch (err) {
    console.error('[Exceptions API] Update error:', err);
    res.status(500).json({ error: 'Failed to update exception status' });
  }
});

/**
 * POST /api/exceptions/bulk-update
 * Bulk update status for multiple exceptions
 */
router.post('/bulk-update', async (req, res) => {
  try {
    const { ids, workflowStatus, resolutionNotes, resolvedBy } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of exception IDs required' });
    }

    const updateData = {
      workflowStatus,
      resolutionNotes: resolutionNotes || 'Bulk resolved via Finance Ops Platform',
      updatedAt: new Date()
    };

    if (workflowStatus === 'RESOLVED') {
      updateData.resolvedBy = resolvedBy || 'Finance Analyst';
      updateData.resolvedAt = new Date();
    }

    const result = await Exception.updateMany(
      { _id: { $in: ids } },
      { $set: updateData }
    );

    res.json({
      message: `Successfully updated ${result.modifiedCount} exceptions`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk update exceptions' });
  }
});

module.exports = router;
