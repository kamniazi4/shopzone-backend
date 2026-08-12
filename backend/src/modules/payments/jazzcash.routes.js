const express = require('express');
const router = express.Router();
const controller = require('./jazzcash.controller');

// No `authenticate` middleware here - JazzCash's server calls this directly,
// not our logged-in browser session.
router.post('/callback', controller.callback);

module.exports = router;