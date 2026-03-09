'use strict';

const express          = require('express');
const router           = express.Router();
const BaseController   = require('../../core/base.controller');
const MemoryController = require('./controllers/memory.controller');

const h = BaseController.asyncHandler.bind(BaseController);

// GET  /api/memory           — list all sessions
router.get('/',        h(MemoryController.list.bind(MemoryController)));

// GET  /api/memory/:id       — get session detail
router.get('/:id',     h(MemoryController.get.bind(MemoryController)));

// DELETE /api/memory/:id     — delete a session
router.delete('/:id',  h(MemoryController.remove.bind(MemoryController)));

module.exports = router;
