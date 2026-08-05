const express = require('express');
const router = express.Router();
const controller = require('./user.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Admin user management
router.get('/', authenticate, checkRole('superadmin', 'admin'), controller.listUsers);
router.get('/:id', authenticate, checkRole('superadmin', 'admin'), validateIntParam('id'), controller.getUserById);
router.put('/:id', authenticate, checkRole('superadmin', 'admin'), validateIntParam('id'), controller.updateUser);
router.delete('/:id', authenticate, checkRole('superadmin'), validateIntParam('id'), controller.deleteUser);

// Self-service addresses
router.get('/me/addresses', authenticate, controller.listMyAddresses);
router.post('/me/addresses', authenticate, controller.addAddress);
router.put('/me/addresses/:id', authenticate, validateIntParam('id'), controller.updateAddress);
router.delete('/me/addresses/:id', authenticate, validateIntParam('id'), controller.deleteAddress);

// Device registration
router.post('/me/devices', authenticate, controller.registerDevice);

module.exports = router;