const express = require('express');
const router = express.Router();
const controller = require('./organization.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate, checkRole('superadmin', 'admin'));

router.get('/', controller.listOrganizations);
router.get('/:id', validateIntParam('id'), controller.getOrganizationById);
router.post('/', controller.createOrganization);
router.put('/:id', validateIntParam('id'), controller.updateOrganization);
router.delete('/:id', validateIntParam('id'), controller.deleteOrganization);

router.get('/:id/users', validateIntParam('id'), controller.listOrganizationUsers);
router.post('/:id/users', validateIntParam('id'), controller.addUserToOrganization);
router.delete('/:id/users/:userId', validateIntParam('id'), validateIntParam('userId'), controller.removeUserFromOrganization);

module.exports = router;