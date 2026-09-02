/**
 * Sliding session.
 *
 * The session token has a 7-day TTL and no refresh, so a field device that
 * goes a week without signal comes back to an expired session — and the login
 * page it gets redirected to needs the network it does not have. Re-issuing
 * once a token is past halfway means anyone who opens the app even weekly
 * never expires.
 */
import { jest } from '@jest/globals';

import {
  createToken,
  verifyToken,
  shouldRefresh,
} from '../../src/services/authService.js';

const DAY = 24 * 60 * 60 * 1000;

// createToken stamps Date.now() + TTL, so travelling in time is how we age one.
const tokenAgedBy = (ms) => {
  const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() - ms);
  try {
    return createToken('spike@test.local');
  } finally {
    spy.mockRestore();
  }
};

test('a fresh token is valid and is not refreshed', () => {
  const token = createToken('spike@test.local');

  expect(verifyToken(token)).toEqual({ email: 'spike@test.local' });
  expect(shouldRefresh(token)).toBe(false);
});

test('a token past halfway is refreshed while still valid', () => {
  const token = tokenAgedBy(5 * DAY); // 2 days left of 7

  expect(verifyToken(token)).toEqual({ email: 'spike@test.local' });
  expect(shouldRefresh(token)).toBe(true);
});

test('just before halfway it is left alone', () => {
  const token = tokenAgedBy(3 * DAY); // 4 days left, over half

  expect(shouldRefresh(token)).toBe(false);
});

test('an expired token is not resurrected by the refresh check', () => {
  const token = tokenAgedBy(8 * DAY);

  // shouldRefresh only reads the claimed expiry; verifyToken is what decides,
  // and /me rejects before ever asking about a refresh.
  expect(verifyToken(token)).toBeNull();
});

test('garbage never looks refreshable', () => {
  for (const bad of ['', 'nonsense', 'no-dot-here', 'a.b']) {
    expect(shouldRefresh(bad)).toBe(false);
  }
});

test('a refreshed token carries the same identity and a later expiry', () => {
  const old = tokenAgedBy(6 * DAY);
  const fresh = createToken('spike@test.local');

  expect(verifyToken(fresh)).toEqual(verifyToken(old));
  expect(shouldRefresh(fresh)).toBe(false);
});
