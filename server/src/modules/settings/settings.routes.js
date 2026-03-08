'use strict';

const express            = require('express');
const router             = express.Router();
const BaseController     = require('../../core/base.controller');
const SettingsController = require('./controllers/settings.controller');

const h = BaseController.asyncHandler.bind(BaseController);

// GET  /api/settings        – load current settings
router.get('/',       h(SettingsController.get.bind(SettingsController)));

// POST /api/settings        – update (partial or full) settings
router.post('/',      h(SettingsController.save.bind(SettingsController)));

// POST /api/settings/reset  – restore factory defaults
router.post('/reset', h(SettingsController.reset.bind(SettingsController)));

module.exports = router;
