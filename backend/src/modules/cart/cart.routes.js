const express = require('express');
const router = express.Router();
const cartController = require('./cart.controller');
const wishlistController = require('./wishlist.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { requireDeviceId } = require('../../middlewares/deviceMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate);

// Cart - all routes require a device id since the cart is device-scoped
router.get('/', requireDeviceId, cartController.getMyCart);
router.post('/items', requireDeviceId, cartController.addItem);
router.put('/items/:itemId', requireDeviceId, validateIntParam('itemId'), cartController.updateItemQuantity);
router.delete('/items/:itemId', requireDeviceId, validateIntParam('itemId'), cartController.removeItem);
router.delete('/', requireDeviceId, cartController.clearCart);

// Wishlist remains user-scoped (not device-scoped)
router.get('/wishlists', wishlistController.listMyWishlists);
router.post('/wishlists', wishlistController.createWishlist);
router.get('/wishlists/:id', validateIntParam('id'), wishlistController.getWishlistItems);
router.post('/wishlists/:id/items', validateIntParam('id'), wishlistController.addWishlistItem);
router.delete('/wishlists/:id/items/:itemId', validateIntParam('id'), validateIntParam('itemId'), wishlistController.removeWishlistItem);
router.delete('/wishlists/:id', validateIntParam('id'), wishlistController.deleteWishlist);

module.exports = router;