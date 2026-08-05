const express = require('express');
const router = express.Router();
const providerController = require('./shippingProvider.controller');
const shipmentController = require('./shipment.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Providers - public read, superadmin write
router.get('/providers', providerController.listProviders);
router.post('/providers', authenticate, checkRole('superadmin'), providerController.createProvider);
router.put('/providers/:id', authenticate, checkRole('superadmin'), validateIntParam('id'), providerController.updateProvider);
router.delete('/providers/:id', authenticate, checkRole('superadmin'), validateIntParam('id'), providerController.deleteProvider);

// Shipments - authenticated, vendor/admin manage, customer can view own order's shipments
router.get('/orders/:orderId', authenticate, validateIntParam('orderId'), shipmentController.listShipmentsByOrder);
router.get('/:id', authenticate, validateIntParam('id'), shipmentController.getShipmentById);

router.post('/orders/:orderId', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('orderId'), shipmentController.createShipment);
router.patch('/:id/status', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), shipmentController.updateShipmentStatus);
router.post('/:id/delivery-proof', authenticate, checkRole('vendor', 'admin', 'superadmin'), validateIntParam('id'), shipmentController.uploadDeliveryProof);

module.exports = router;