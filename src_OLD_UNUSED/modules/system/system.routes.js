const express = require('express');
const router = express.Router();
const { listAuditLogs } = require('./auditLog.controller');
const { listSettings, getSetting, upsertSetting, deleteSetting, logEvent, listEvents } = require('./settings.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');

// Audit logs (admin only)
router.get('/audit-logs', authenticate, checkRole('admin', 'superadmin'), listAuditLogs);

// System settings
router.get('/settings', authenticate, checkRole('admin', 'superadmin'), listSettings);
router.get('/settings/:key', authenticate, checkRole('admin', 'superadmin'), getSetting);
router.put('/settings/:key', authenticate, checkRole('superadmin'), upsertSetting);
router.delete('/settings/:key', authenticate, checkRole('superadmin'), deleteSetting);

// Events
router.post('/events', authenticate, checkRole('admin', 'superadmin'), logEvent);
router.get('/events', authenticate, checkRole('admin', 'superadmin'), listEvents);

module.exports = router;
