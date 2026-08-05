const express = require('express');
const router = express.Router();
const roleController = require('./role.controller');
const permissionController = require('./permission.controller');
const { authenticate } = require('../../middlewares/authMiddleware');
const { checkRole } = require('../../middlewares/rbacMiddleware');
const { validateIntParam } = require('../../middlewares/validateParam');

router.use(authenticate, checkRole('superadmin'));

// Roles
router.get('/roles', roleController.listRoles);
router.post('/roles', roleController.createRole);
router.put('/roles/:id', validateIntParam('id'), roleController.updateRole);
router.delete('/roles/:id', validateIntParam('id'), roleController.deleteRole);

// User <-> Role
router.post('/user-roles', roleController.assignRoleToUser);
router.delete('/user-roles', roleController.removeRoleFromUser);

// Role <-> Permission
router.post('/role-permissions', roleController.assignPermissionToRole);
router.delete('/role-permissions', roleController.removePermissionFromRole);

// Permissions
router.get('/permissions', permissionController.listPermissions);
router.post('/permissions', permissionController.createPermission);
router.delete('/permissions/:id', validateIntParam('id'), permissionController.deletePermission);

module.exports = router;