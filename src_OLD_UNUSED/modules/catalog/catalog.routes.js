const express = require('express');
const router = express.Router();
const categoryController = require('./category.controller');
const attributeController = require('./attribute.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

// Categories - public read
router.get('/categories', categoryController.listCategories);
router.get('/categories/:id', validateIntParam('id'), categoryController.getCategoryById);

// Categories - admin write
router.post('/categories', authenticate, checkRole('admin', 'superadmin'), categoryController.createCategory);
router.put('/categories/:id', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), categoryController.updateCategory);
router.delete('/categories/:id', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), categoryController.deleteCategory);

// Attributes - public read
router.get('/attributes', attributeController.listAttributes);
router.get('/attributes/:id/values', validateIntParam('id'), attributeController.listAttributeValues);

// Attributes - admin write
router.post('/attributes', authenticate, checkRole('admin', 'superadmin'), attributeController.createAttribute);
router.delete('/attributes/:id', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), attributeController.deleteAttribute);
router.post('/attributes/:id/values', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), attributeController.addAttributeValue);
router.delete('/attributes/:id/values/:valueId', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), attributeController.deleteAttributeValue);

module.exports = router;
