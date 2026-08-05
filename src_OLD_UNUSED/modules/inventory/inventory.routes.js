const express = require('express');
const router = express.Router();
const warehouseController = require('./warehouse.controller');
const inventoryController = require('./inventory.controller');
const movementController = require('./stockMovement.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

const vendorOrAdmin = checkRole('vendor', 'admin', 'superadmin');
router.use(authenticate, vendorOrAdmin);

// Warehouses
router.get('/warehouses', warehouseController.listWarehouses);
router.get('/warehouses/:id', validateIntParam('id'), warehouseController.getWarehouseById);
router.post('/warehouses', warehouseController.createWarehouse);
router.put('/warehouses/:id', validateIntParam('id'), warehouseController.updateWarehouse);
router.delete('/warehouses/:id', validateIntParam('id'), warehouseController.deleteWarehouse);

// Warehouse transfers
router.get('/warehouses/:id/transfers', validateIntParam('id'), warehouseController.listTransfers);
router.post('/transfers', warehouseController.createTransfer);
router.patch('/transfers/:id/complete', validateIntParam('id'), warehouseController.completeTransfer);

// Inventory
router.get('/', inventoryController.listInventory);
router.get('/:id', validateIntParam('id'), inventoryController.getInventoryById);
router.post('/', inventoryController.upsertInventory);
router.patch('/:id/adjust', validateIntParam('id'), inventoryController.adjustInventory);

// Inventory alerts
router.post('/:id/alerts', validateIntParam('id'), inventoryController.setAlert);
router.get('/alerts/triggered', inventoryController.listTriggeredAlerts);

// Inventory movements & reservations
router.get('/:id/movements', validateIntParam('id'), movementController.listMovements);
router.post('/:id/reservations', validateIntParam('id'), movementController.createReservation);
router.patch('/reservations/:reservationId/release', movementController.releaseReservation);
router.patch('/reservations/:reservationId/complete', movementController.completeReservation);

module.exports = router;