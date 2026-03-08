const express = require('express');
const router = express.Router();
const BaseController = require('../../core/base.controller');
const FilesController = require('../controllers/files.controller');

// ── Files Routes ─────────────────────────────────────────────────────────────

// GET /api/files/list - List files in directory
router.get('/list', BaseController.asyncHandler(FilesController.list.bind(FilesController)));

// GET /api/files/read - Read file contents
router.get('/read', BaseController.asyncHandler(FilesController.read.bind(FilesController)));

// POST /api/files/write - Write file contents
router.post('/write', BaseController.asyncHandler(FilesController.write.bind(FilesController)));

module.exports = router;
