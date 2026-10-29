const express = require('express');
const router = express.Router();
const opportunityController = require('../controllers/opportunityController');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// GET /opportunities/recommended – Get recommendations for logged-in student
router.get('/recommended', requireAuth, opportunityController.getRecommended);

// GET /opportunities/admin/analytics - Admin analytics overview
router.get('/admin/analytics', requireAuth, requireAdmin, opportunityController.getAdminAnalytics);

// POST /opportunities/import - Admin bulk CSV import
router.post('/import', requireAuth, requireAdmin, opportunityController.importCsvOpportunities);

// POST /opportunities - Admin create single opportunity
router.post('/', requireAuth, requireAdmin, opportunityController.createOpportunity);

// GET /opportunities – Fetch all (with filters & optional pagination)
router.get('/', opportunityController.getOpportunities);

// GET /opportunities/insights - Administrative operational insights (protected)
router.get('/insights', requireAuth, requireAdmin, opportunityController.getOpportunityInsights);

// GET /opportunities/:id/eligibility – Check eligibility for an opportunity
router.get('/:id/eligibility', requireAuth, opportunityController.checkEligibility);

// GET /opportunities/:id/engagement - Aggregate engagement metrics
router.get('/:id/engagement', opportunityController.getEngagement);

// PATCH /opportunities/:id/status - Admin update opportunity status (ACTIVE/INACTIVE/EXPIRED)
router.patch('/:id/status', requireAuth, requireAdmin, opportunityController.updateOpportunityStatus);

// PUT & PATCH /opportunities/:id - Admin update opportunity
router.put('/:id', requireAuth, requireAdmin, opportunityController.updateOpportunity);
router.patch('/:id', requireAuth, requireAdmin, opportunityController.updateOpportunity);

// DELETE /opportunities/:id - Admin safe delete (soft-deactivates if applications exist)
router.delete('/:id', requireAuth, requireAdmin, opportunityController.deleteOpportunity);

// GET /opportunities/:id – Fetch single
router.get('/:id', opportunityController.getOpportunityById);

module.exports = router;
