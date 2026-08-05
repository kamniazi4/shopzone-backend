const express = require('express');
const router = express.Router();
const controller = require('./vendor.controller');
const walletController = require('./vendorWallet.controller');
const shippingController = require('./vendorShipping.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Public / general
router.get('/', controller.listVendors);
router.get('/:id', validateIntParam('id'), controller.getVendorById);

// Vendor self-registration
router.post('/register', authenticate, controller.registerVendor);

// Vendor or admin management
router.put('/:id', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), controller.updateVendor);
router.patch('/:id/status', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), controller.updateVendorStatus);

// Vendor settings
router.get('/:id/settings', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), controller.getVendorSettings);
router.put('/:id/settings', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), controller.upsertVendorSettings);

// Vendor staff
router.get('/:id/staff', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), controller.listVendorUsers);
router.post('/:id/staff', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), controller.addVendorStaff);
router.delete('/:id/staff/:userId', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), validateIntParam('userId'), controller.removeVendorStaff);

// Vendor wallet & transactions
router.get('/:id/wallet', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), walletController.getWallet);
router.get('/:id/transactions', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), walletController.listTransactions);
router.post('/:id/transactions', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), walletController.createTransaction);

// Vendor shipping settings
router.get('/:id/shipping-settings', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), shippingController.listVendorShippingSettings);
router.post('/:id/shipping-settings', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), shippingController.addVendorShippingSetting);
router.put('/:id/shipping-settings/:settingId', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), shippingController.updateVendorShippingSetting);
router.delete('/:id/shipping-settings/:settingId', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), shippingController.deleteVendorShippingSetting);

module.exports = router;