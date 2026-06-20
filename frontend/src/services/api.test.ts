import { get, addErrorInterceptor } from './api';
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

describe('API Error Handling', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('handles 2xx success', async () => {
    const mockResponse = { data: 'success' };
    (global.fetch as Mock).mockResolvedValueOnce(new Response(JSON.stringify(mockResponse), {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': 'application/json' }
    }));

    const result = await get('/test');
    expect(result.data).toEqual(mockResponse);
    expect(result.status).toBe(200);
  });

  it('rejects on 401 JSON error and maps error payload', async () => {
    const errorPayload = { message: 'Unauthorized', details: { reason: 'token_expired' }, path: '/test' };
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-ID': 'req-123' }),
      json: async () => errorPayload,
      url: 'http://localhost/test',
    });

    await expect(get('/test')).rejects.toMatchObject({
      code: 401,
      message: 'Unauthorized',
      details: { reason: 'token_expired' },
      path: '/test',
      requestId: 'req-123'
    });
  });

  it('rejects on 429 rate-limit error (and tests retry backoff break)', async () => {
    const errorPayload = { message: 'Rate limited' };
    (global.fetch as Mock).mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => errorPayload,
      url: 'http://localhost/test',
    });

    const promise = get('/test', undefined, { retries: 0 });

    await expect(promise).rejects.toMatchObject({
      code: 429,
      message: 'Rate limited'
    });
    // Should be called 1 time because retries are disabled
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects on 500 text error', async () => {
    (global.fetch as Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      headers: new Headers({ 'Content-Type': 'text/plain' }),
      text: async () => 'Internal Server Error Text',
      url: 'http://localhost/test',
    });

    const promise = get('/test', undefined, { retries: 0 }); // disable retry for fast test
    await expect(promise).rejects.toMatchObject({
      code: 500,
      message: 'Internal Server Error Text',
      details: { responseText: 'Internal Server Error Text' }
    });
  });

  it('handles aborted request behavior (timeout)', async () => {
    (global.fetch as Mock).mockImplementationOnce((url, options) => {
      return new Promise((_, reject) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    });

    const promise = get('/test', undefined, { retries: 0 });
    
    await expect(promise).rejects.toMatchObject({
      code: 408,
      message: 'Request timed out'
    });
  });
});
