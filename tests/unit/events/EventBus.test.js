// tests/unit/events/EventBus.test.js
import { jest } from '@jest/globals';
import { eventBus, Events } from '../../../src/events/EventBus.js';

describe('EventBus', () => {
  // Track handlers for cleanup
  const handlers = [];
  
  const registerHandler = (event, handler) => {
    const unsubscribe = eventBus.on(event, handler);
    handlers.push({ event, handler, unsubscribe });
    return unsubscribe;
  };

  afterEach(() => {
    // Clean up all registered handlers
    handlers.forEach(({ event, handler }) => {
      eventBus.off(event, handler);
    });
    handlers.length = 0;
  });

  describe('on/emit', () => {
    test('registers and calls handler', () => {
      const handler = jest.fn();
      registerHandler(Events.STEP_CHANGED, handler);
      
      eventBus.emit(Events.STEP_CHANGED, { step: 'test' });
      
      expect(handler).toHaveBeenCalledWith({ step: 'test' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('supports multiple handlers for same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      registerHandler(Events.FORM_CHANGED, handler1);
      registerHandler(Events.FORM_CHANGED, handler2);
      
      eventBus.emit(Events.FORM_CHANGED, { data: 'test' });
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    test('does not call handlers for different events', () => {
      const handler = jest.fn();
      registerHandler(Events.STEP_CHANGED, handler);
      
      eventBus.emit(Events.FORM_CHANGED, {});
      
      expect(handler).not.toHaveBeenCalled();
    });

    test('passes context to handler when provided', () => {
      const context = { name: 'testContext' };
      const handler = jest.fn(function() {
        return this;
      });
      
      eventBus.on(Events.STEP_CHANGED, handler, context);
      handlers.push({ event: Events.STEP_CHANGED, handler });
      
      eventBus.emit(Events.STEP_CHANGED, {});
      
      expect(handler.mock.instances[0]).toBe(context);
    });
  });

  describe('off', () => {
    test('removes specific handler', () => {
      const handler = jest.fn();
      eventBus.on(Events.STEP_CHANGED, handler);
      eventBus.off(Events.STEP_CHANGED, handler);
      
      eventBus.emit(Events.STEP_CHANGED, {});
      
      expect(handler).not.toHaveBeenCalled();
    });

    test('returns unsubscribe function from on()', () => {
      const handler = jest.fn();
      const unsubscribe = eventBus.on(Events.STEP_CHANGED, handler);
      
      unsubscribe();
      eventBus.emit(Events.STEP_CHANGED, {});
      
      expect(handler).not.toHaveBeenCalled();
    });

    test('does not throw when removing non-existent handler', () => {
      const handler = jest.fn();
      
      expect(() => {
        eventBus.off(Events.STEP_CHANGED, handler);
      }).not.toThrow();
    });

    test('does not throw when removing from non-existent event', () => {
      const handler = jest.fn();
      
      expect(() => {
        eventBus.off('nonexistent:event', handler);
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    test('continues calling handlers if one throws', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const errorHandler = jest.fn(() => { throw new Error('Test error'); });
      const normalHandler = jest.fn();
      
      registerHandler(Events.STEP_CHANGED, errorHandler);
      registerHandler(Events.STEP_CHANGED, normalHandler);
      
      expect(() => {
        eventBus.emit(Events.STEP_CHANGED, {});
      }).not.toThrow();
      
      expect(normalHandler).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();
      
      consoleError.mockRestore();
    });
  });

  describe('listEvents', () => {
    test('returns list of registered events', () => {
      registerHandler(Events.STEP_CHANGED, jest.fn());
      registerHandler(Events.FORM_CHANGED, jest.fn());
      
      const events = eventBus.listEvents();
      
      expect(events).toContain(Events.STEP_CHANGED);
      expect(events).toContain(Events.FORM_CHANGED);
    });
  });

  describe('Events constants', () => {
    test('has navigation events', () => {
      expect(Events.STEP_CHANGED).toBe('step:changed');
      expect(Events.OFFER_STARTED).toBe('offer:started');
      expect(Events.OFFER_RESET).toBe('offer:reset');
    });

    test('has data events', () => {
      expect(Events.PRICING_UPDATED).toBe('pricing:updated');
      expect(Events.FORM_CHANGED).toBe('form:changed');
      expect(Events.FORM_VALIDATED).toBe('form:validated');
    });

    test('has UI events', () => {
      expect(Events.TOAST_SHOW).toBe('toast:show');
      expect(Events.SIDEBAR_UPDATE).toBe('sidebar:update');
      expect(Events.WIDGET_UPDATE).toBe('widget:update');
    });

    test('has persistence events', () => {
      expect(Events.DRAFT_SAVED).toBe('draft:saved');
      expect(Events.DRAFT_LOADED).toBe('draft:loaded');
      expect(Events.OFFER_EXPORTED).toBe('offer:exported');
    });
  });
});