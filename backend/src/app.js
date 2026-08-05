// Express app configuration - middleware registration and route mounting
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const rbacRoutes = require('./modules/rbac/rbac.routes');
const organizationRoutes = require('./modules/organizations/organization.routes');
const vendorRoutes = require('./modules/vendors/vendor.routes');
const supplierRoutes = require('./modules/suppliers/supplier.routes');
const catalogRoutes = require('./modules/catalog/catalog.routes');
const productRoutes = require('./modules/products/product.routes');
const inventoryRoutes = require('./modules/inventory/inventory.routes');
const cartRoutes = require('./modules/cart/cart.routes');
const orderRoutes = require('./modules/orders/order.routes');
const promotionRoutes = require('./modules/promotions/promotion.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const shippingRoutes = require('./modules/shipping/shipping.routes');
const reviewRoutes = require('./modules/reviews/review.routes');
const refundRoutes = require('./modules/refunds/refund.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const systemRoutes = require('./modules/system/system.routes');
const bannerRoutes = require('./modules/banners/banner.routes');
const recommendationRoutes = require('./modules/products/recommendation.routes');
const stripeRoutes = require('./modules/payments/stripe.routes');
const app = express();

// Global middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// Root & health check
app.get('/', (req, res) => res.json({ status: 'ok', message: 'Ecomm API is running', version: '1.0.0' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Route mounting
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/recommendations', recommendationRoutes);
// 404 and error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;