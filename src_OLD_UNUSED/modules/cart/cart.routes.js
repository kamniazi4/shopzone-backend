const express = require('express');
const router = express.Router();
const cartController = require('./cart.controller');
const wishlistController = require('./wishlist.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate);

// Cart
router.get('/', cartController.getMyCart);
router.post('/items', cartController.addItem);
router.put('/items/:itemId', validateIntParam('itemId'), cartController.updateItemQuantity);
router.delete('/items/:itemId', validateIntParam('itemId'), cartController.removeItem);
router.delete('/', cartController.clearCart);

// Wishlist
router.get('/wishlists', wishlistController.listMyWishlists);
router.post('/wishlists', wishlistController.createWishlist);
router.get('/wishlists/:id', validateIntParam('id'), wishlistController.getWishlistItems);
router.post('/wishlists/:id/items', validateIntParam('id'), wishlistController.addWishlistItem);
router.delete('/wishlists/:id/items/:itemId', validateIntParam('id'), validateIntParam('itemId'), wishlistController.removeWishlistItem);
router.delete('/wishlists/:id', validateIntParam('id'), wishlistController.deleteWishlist);

module.exports = router;