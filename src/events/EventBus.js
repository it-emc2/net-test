/* eslint-disable no-undef */
// src/events/EventBus.js
export const Events = {
  // Wizard flow
  OFFER_STARTED: 'offer:started',
  OFFER_RESET: 'offer:reset',
  STEP_CHANGED: 'step:changed',

  // State management
  STATE_RESTORED: 'state:restored',
  
  // Form events
  FORM_CHANGED: 'form:changed',              // General form change
  FORM_FIELD_CHANGED: 'form:field:changed',  // Request to update field (from view)
  FORM_DATA_SET: 'form:data:set',            // Request to bulk update (from view)
  FIELD_CHANGED: 'field:changed',            // Notification that field changed (from state)
  
  // Validation
  VALIDATION_REQUESTED: 'validation:requested',
  VALIDATION_RESULT: 'validation:result',

  // Pricing
  PRICING_REQUESTED: 'pricing:requested',
  PRICING_UPDATED: 'pricing:updated',
  PRICING_ERROR: 'pricing:error',

  // UI notifications
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_ERROR: 'notification:error',
  NOTIFICATION_SUCCESS: 'notification:success',
  NOTIFICATION_WARNING: 'notification:warning',

  // Loading states
  LOADING_START: 'loading:start',
  LOADING_END: 'loading:end',
};

class EventBus {
  constructor() {
    this._events = new Map();
    this._debugMode = false;
  }

  on(event, handler, context = null) {
    if (!this._events.has(event)) {
      this._events.set(event, []);
    }

    const listener = { handler, context };
    this._events.get(event).push(listener);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  off(event, handler) {
    if (!this._events.has(event)) return;

    const listeners = this._events.get(event);
    const index = listeners.findIndex(l => l.handler === handler);
    
    if (index !== -1) {
      listeners.splice(index, 1);
    }

    if (listeners.length === 0) {
      this._events.delete(event);
    }
  }

  emit(event, data) {
    if (this._debugMode) {
      console.log(`[EventBus] ${event}`, data);
    }

    if (!this._events.has(event)) return;

    const listeners = [...this._events.get(event)];
    listeners.forEach(({ handler, context }) => {
      try {
        handler.call(context, data, event);
      } catch (error) {
        console.error(`[EventBus] Error in handler for "${event}":`, error);
      }
    });
  }

  once(event, handler, context = null) {
    const wrapper = (data, eventName) => {
      handler.call(context, data, eventName);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper, context);
  }

  clear(event) {
    if (event) {
      this._events.delete(event);
    } else {
      this._events.clear();
    }
  }

  setDebugMode(enabled) {
    this._debugMode = enabled;
  }

  // Get all active event subscriptions (for debugging)
  getSubscriptions() {
    const result = {};
    this._events.forEach((listeners, event) => {
      result[event] = listeners.length;
    });
    return result;
  }
}

export const eventBus = new EventBus();

// Dev tools
if (typeof window !== 'undefined') {
  window.__EMC2_EVENTS__ = eventBus;
  
  // Enable debug mode via console
  window.debugEvents = (enable = true) => {
    eventBus.setDebugMode(enable);
    console.log(`Event debugging ${enable ? 'enabled' : 'disabled'}`);
  };
}