const express = require('express');
const router = express.Router();
const controller = require('./notification.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate);

// Self-service notifications
router.get('/', controller.listMyNotifications);
router.patch('/:id/read', validateIntParam('id'), controller.markAsRead);
router.patch('/read-all', controller.markAllAsRead);
router.delete('/:id', validateIntParam('id'), controller.deleteNotification);

// Admin creates notifications for users
router.post('/', checkRole('admin', 'superadmin'), controller.createNotification);

// Templates (admin only)
router.get('/templates', checkRole('admin', 'superadmin'), controller.listTemplates);
router.post('/templates', checkRole('superadmin'), controller.createTemplate);
router.put('/templates/:id', checkRole('superadmin'), validateIntParam('id'), controller.updateTemplate);
router.delete('/templates/:id', checkRole('superadmin'), validateIntParam('id'), controller.deleteTemplate);

module.exports = router;