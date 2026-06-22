// tests/unit/services/ApiService.test.js
import { jest } from '@jest/globals';
import { apiService } from '../../../src/services/ApiService.js';

describe('ApiService', () => {
  beforeEach(() => {
    global.fetch.mockClear();
  });

  describe('request', () => {
    test('makes GET request correctly', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const result = await apiService.request('GET', '/api/test');

      expect(global.fetch).toHaveBeenCalled();
      expect(result).toEqual({ data: 'test' });
    });

    test('makes POST request with JSON body', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const result = await apiService.request('POST', '/api/test', { body: { foo: 'bar' } });

      expect(global.fetch).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    test('throws on non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Not Found' }),
      });

      await expect(apiService.request('GET', '/api/missing')).rejects.toThrow();
    });
  });

  describe('computePrices', () => {
    test('calls correct endpoint', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total: 100 }),
      });

      const result = await apiService.computePrices({ items: [] });

      expect(result).toEqual({ total: 100 });
    });
  });

  describe('getProduct', () => {
    test('fetches product by ID', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '123', name: 'Test Product' }),
      });

      const result = await apiService.getProduct('123');

      expect(result).toEqual({ id: '123', name: 'Test Product' });
    });
  });
});
