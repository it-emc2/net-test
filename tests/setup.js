// tests/setup.js - FIXED VERSION
import { jest } from '@jest/globals';

// Only set up JSDOM for tests that need it
// For node environment tests, we skip DOM setup
const isBrowser = typeof window !== 'undefined';

if (!isBrowser) {
  // Dynamic import to avoid issues in pure node tests
  const { JSDOM } = await import('jsdom');
  
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost:3000',
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });

  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.CustomEvent = dom.window.CustomEvent;
  global.Event = dom.window.Event;
  global.FormData = dom.window.FormData;
  global.localStorage = dom.window.localStorage;
  global.sessionStorage = dom.window.sessionStorage;
  
  // Fix location to be configurable
  Object.defineProperty(global, 'location', {
    value: dom.window.location,
    writable: true,
    configurable: true,
  });
}

// Mock fetch globally
// eslint-disable-next-line no-unused-vars
global.fetch = jest.fn((url, options = {}) => {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    clone: function() { return this; },
  });
});

// Reset state between tests
afterEach(() => {
  jest.clearAllMocks();
  
  if (global.localStorage) {
    global.localStorage.clear();
  }
  if (global.sessionStorage) {
    global.sessionStorage.clear();
  }
  if (global.window?.location) {
    global.window.location.hash = '';
  }
});

console.log('[Test Setup] Environment initialized');