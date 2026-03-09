'use strict';

const BaseController = require('../../../src/core/base.controller');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a mock Express response object */
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

/** Create a concrete instance (BaseController is abstract-like but not truly abstract) */
function makeCtrl() {
  return new BaseController({ moduleName: 'Test' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BaseController', () => {

  describe('ok()', () => {
    it('sends 200 with success envelope', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.ok(res, { id: 1 });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { id: 1 } })
      );
    });

    it('includes a timestamp string', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.ok(res, {});

      const payload = res.json.mock.calls[0][0];
      expect(typeof payload.timestamp).toBe('string');
    });

    it('accepts a custom status code', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.ok(res, {}, 201);

      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('created()', () => {
    it('sends 201', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.created(res, { id: 42 });

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { id: 42 } })
      );
    });
  });

  describe('error()', () => {
    it('sends the given status code and error message', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.error(res, 'Something went wrong', 422);

      expect(res.status).toHaveBeenCalledWith(422);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Something went wrong' })
      );
    });

    it('defaults to 500', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.error(res, 'oops');

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('includes details when provided', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.error(res, 'fail', 500, 'extra info');

      const payload = res.json.mock.calls[0][0];
      expect(payload.details).toBe('extra info');
    });
  });

  describe('badRequest()', () => {
    it('sends 400', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.badRequest(res, '"name" is required');

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: '"name" is required' })
      );
    });
  });

  describe('notFound()', () => {
    it('sends 404 with default message', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.notFound(res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('sends 404 with custom message', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.notFound(res, 'Session not found');

      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toBe('Session not found');
    });
  });

  describe('serverError()', () => {
    it('sends 500', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.serverError(res, 'Internal failure');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Internal failure' })
      );
    });

    it('exposes err.message in details', () => {
      const ctrl = makeCtrl();
      const res  = mockRes();

      ctrl.serverError(res, 'Internal failure', new Error('disk full'));

      const payload = res.json.mock.calls[0][0];
      expect(payload.details).toBe('disk full');
    });
  });

  describe('asyncHandler()', () => {
    it('calls the wrapped function with req, res, next', async () => {
      const fn   = jest.fn().mockResolvedValue('ok');
      const req  = {};
      const res  = mockRes();
      const next = jest.fn();

      await BaseController.asyncHandler(fn)(req, res, next);

      expect(fn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards thrown errors to next()', async () => {
      const err  = new Error('async boom');
      const fn   = jest.fn().mockRejectedValue(err);
      const req  = {};
      const res  = mockRes();
      const next = jest.fn();

      await BaseController.asyncHandler(fn)(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
