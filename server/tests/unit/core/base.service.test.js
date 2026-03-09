'use strict';

const BaseService = require('../../../src/core/base.service');

function makeService() {
  return new BaseService({ serviceName: 'TestService' });
}

describe('BaseService', () => {

  describe('constructor', () => {
    it('stores serviceName', () => {
      const svc = makeService();
      expect(svc.serviceName).toBe('TestService');
    });

    it('defaults serviceName to "Service"', () => {
      const svc = new BaseService();
      expect(svc.serviceName).toBe('Service');
    });
  });

  describe('validate()', () => {
    it('passes when all required fields are present', () => {
      const svc    = makeService();
      const result = svc.validate(
        { name: 'Alice', age: 30 },
        { name: { required: true, type: 'string' }, age: { required: true, type: 'number' } }
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when a required field is missing', () => {
      const svc    = makeService();
      const result = svc.validate(
        { age: 30 },
        { name: { required: true } }
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('"name" is required');
    });

    it('fails when a field has the wrong type', () => {
      const svc    = makeService();
      const result = svc.validate(
        { count: 'five' },
        { count: { type: 'number' } }
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/"count" must be number/);
    });

    it('correctly identifies arrays', () => {
      const svc    = makeService();
      const result = svc.validate(
        { items: [1, 2, 3] },
        { items: { type: 'array' } }
      );

      expect(result.valid).toBe(true);
    });

    it('fails when array is passed but object expected', () => {
      const svc    = makeService();
      const result = svc.validate(
        { config: [] },
        { config: { type: 'object' } }
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/got array/);
    });

    it('skips type check for undefined optional fields', () => {
      const svc    = makeService();
      const result = svc.validate(
        {},
        { optionalField: { required: false, type: 'string' } }
      );

      expect(result.valid).toBe(true);
    });

    it('returns multiple errors for multiple invalid fields', () => {
      const svc    = makeService();
      const result = svc.validate(
        {},
        { a: { required: true }, b: { required: true } }
      );

      expect(result.errors).toHaveLength(2);
    });
  });
});
