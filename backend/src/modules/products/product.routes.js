const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const variantController = require('./variant.controller');
const imageController = require('./productImage.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');
const upload = require('../../middlewares/uploadMiddleware');

const vendorOrAdmin = checkRole('vendor', 'admin', 'superadmin');

// Products - public read
router.get('/', productController.listProducts);
router.get('/filters', productController.getProductFilters);
router.get('/:id', validateIntParam('id'), productController.getProductById);
router.get('/:id/status-history', validateIntParam('id'), productController.getProductStatusHistory);

// Products - vendor/admin write
router.post('/', authenticate, vendorOrAdmin, productController.createProduct);
router.put('/:id', authenticate, vendorOrAdmin, validateIntParam('id'), productController.updateProduct);
router.patch('/:id/status', authenticate, vendorOrAdmin, validateIntParam('id'), productController.updateProductStatus);
router.patch('/:id/approve', authenticate, checkRole('admin', 'superadmin'), validateIntParam('id'), productController.approveVendorProduct);
router.delete('/:id', authenticate, vendorOrAdmin, validateIntParam('id'), productController.deleteProduct);

// Variants
router.get('/:productId/variants', validateIntParam('productId'), variantController.listVariants);
router.get('/variants/:id', validateIntParam('id'), variantController.getVariantById);
router.post('/:productId/variants', authenticate, vendorOrAdmin, validateIntParam('productId'), variantController.createVariant);
router.put('/variants/:id', authenticate, vendorOrAdmin, validateIntParam('id'), variantController.updateVariant);
router.delete('/variants/:id', authenticate, vendorOrAdmin, validateIntParam('id'), variantController.deleteVariant);

// Variant pricing
router.get('/variants/:id/prices', validateIntParam('id'), variantController.listVariantPrices);
router.post('/variants/:id/prices', authenticate, vendorOrAdmin, validateIntParam('id'), variantController.addVariantPrice);
router.post('/variants/:id/promotion-price', authenticate, vendorOrAdmin, validateIntParam('id'), variantController.addPromotionPrice);
router.get('/variants/:id/effective-price', validateIntParam('id'), variantController.getEffectivePrice);

// Product images
router.get('/:productId/images', validateIntParam('productId'), imageController.listProductImages);
router.post('/:productId/images', authenticate, vendorOrAdmin, validateIntParam('productId'), imageController.addProductImage);
router.post('/:productId/images/upload', authenticate, vendorOrAdmin, validateIntParam('productId'), upload.single('image'), imageController.uploadProductImage);
router.patch('/:productId/images/:id/featured', authenticate, vendorOrAdmin, validateIntParam('productId'), validateIntParam('id'), imageController.setFeaturedImage);
router.delete('/:productId/images/:id', authenticate, vendorOrAdmin, validateIntParam('productId'), validateIntParam('id'), imageController.deleteProductImage);

module.exports = router;