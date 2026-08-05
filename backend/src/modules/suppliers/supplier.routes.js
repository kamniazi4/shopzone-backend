const express = require('express');
const router = express.Router();
const controller = require('./supplier.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate, checkRole('admin', 'superadmin'));

router.get('/', controller.listSuppliers);
router.get('/:id', validateIntParam('id'), controller.getSupplierById);
router.post('/', controller.createSupplier);
router.put('/:id', validateIntParam('id'), controller.updateSupplier);
router.delete('/:id', validateIntParam('id'), controller.deleteSupplier);

router.get('/:id/products', validateIntParam('id'), controller.listSupplierProducts);
router.post('/:id/products', validateIntParam('id'), controller.linkSupplierProduct);
router.delete('/:id/products/:variantId', validateIntParam('id'), controller.unlinkSupplierProduct);

module.exports = router;