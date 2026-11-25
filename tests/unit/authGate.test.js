/**
 * authGate: public allowlist must match how Express actually routes.
 * Express routing is case-insensitive and ignores a trailing slash, so the
 * gate must not let /api/signing/STATUS/x or POST /api/signing/ through.
 */
import { authGate } from '../../src/middleware/authGate.js';
import { createToken } from '../../src/services/authService.js';

function run(method, path, { headers = {} } = {}) {
  const req = { method, path, originalUrl: path, headers, query: {} };
  const out = { passed: false, status: null, redirect: null };
  const res = {
    status(code) {
      out.status = code;
      return this;
    },
    json() {
      return this;
    },
    redirect(dest) {
      out.status = 302;
      out.redirect = dest;
    },
  };
  authGate(req, res, () => {
    out.passed = true;
  });
  return { ...out, req };
}

const blocked = (method, path) => {
  const r = run(method, path);
  expect(r.passed).toBe(false);
  expect(r.status).toBe(401);
};
const open = (method, path) => {
  expect(run(method, path).passed).toBe(true);
};

describe('signing status (internal dashboard) needs a session', () => {
  test.each([
    '/api/signing/status/ANG-123',
    '/api/signing/STATUS/ANG-123',
    '/api/signing/Status/ANG-123/signed',
    '/API/SIGNING/STATUS/ANG-123/SIGNED',
    '/api/signing/status',
    '/api/signing/status/',
    '/api/signing/%73tatus/ANG-123',
  ])('%s → 401', (p) => blocked('GET', p));
});

describe('creating a signing request needs a session', () => {
  test.each(['/api/signing', '/api/signing/', '/API/Signing/', '/api/signing//'])(
    'POST %s → 401',
    (p) => blocked('POST', p),
  );
});

describe('token-scoped customer signing stays public', () => {
  test.each([
    ['GET', '/sign/abc123'],
    ['GET', '/sign/abc123/'],
    ['GET', '/api/signing/abc123'],
    ['GET', '/api/signing/AbC123'],
    ['GET', '/api/signing/abc123/documents/angebot/html'],
    ['GET', '/api/signing/abc123/documents/angebot/pdf'],
    ['POST', '/api/signing/abc123/documents/angebot'],
  ])('%s %s → next()', (m, p) => open(m, p));

  test('unknown deeper signing paths are not public', () => {
    blocked('GET', '/api/signing/abc123/documents/angebot/other');
    blocked('GET', '/api/signing/abc123/whatever');
  });
});

describe('asset rule', () => {
  test.each([
    '/api/offers/x.pdf',
    '/api/offers/123/export.PDF',
    '/API/offers/x.js',
    '/api/signing/status/ANG-1/x.pdf',
  ])('API path %s ending like an asset → 401', (p) => blocked('GET', p));

  test.each([
    '/script.js',
    '/styles.css',
    '/assets/logo.png',
    '/pdfjs/build/pdf.mjs',
    '/vendor/lib.js',
    '/signpage/app.js',
    '/configurator/x',
  ])('static asset %s → next()', (p) => open('GET', p));

  test.each(['/logic/pricing-core.js', '/logic/tray-search-core.js', '/LOGIC/pricing-core.js'])(
    '%s stays private',
    (p) => blocked('GET', p),
  );
});

describe('session', () => {
  test('a logged-in user passes a private API', () => {
    const token = createToken('gate@test.local');
    const r = run('GET', '/api/signing/STATUS/ANG-1', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.passed).toBe(true);
    expect(r.req.user).toEqual({ email: 'gate@test.local' });
  });

  test('browser navigation without session redirects to /login', () => {
    const r = run('GET', '/', { headers: { accept: 'text/html' } });
    expect(r.passed).toBe(false);
    expect(r.redirect).toBe('/login');
  });

  test.each(['/login', '/api/health', '/api/auth/login'])('%s is public', (p) =>
    open('GET', p),
  );
});
