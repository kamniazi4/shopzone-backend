const express = require('express');
const router = express.Router();
const controller = require('./easypaisa.controller');

router.post('/callback', controller.callback);

module.exports = router;