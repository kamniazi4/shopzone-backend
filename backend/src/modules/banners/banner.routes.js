const express = require('express');
const router = express.Router();
const controller = require('./banner.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Public read - homepage needs this without login
router.get('/', controller.listActiveBanners);

// Admin management
router.get('/all', authenticate, checkRole('admin', 'superadmin'), controller.listAllBanners);
router.post('/', authenticate, checkRole('admin', 'superadmin'), controller.createBanner);
router.put('/:id', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), controller.updateBanner);
router.delete('/:id', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), controller.deleteBanner);

module.exports = router;
