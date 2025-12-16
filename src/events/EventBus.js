// src/events/EventBus.js
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback, context = null) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push({ callback, context });
    
    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const listeners = this.listeners.get(event);
    const index = listeners.findIndex(l => l.callback === callback);
    if (index > -1) listeners.splice(index, 1);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).forEach(({ callback, context }) => {
      try {
        callback.call(context, data);
      } catch (e) {
        console.error(`[EventBus] Error in ${event} handler:`, e);
      }
    });
  }

  // For debugging
  listEvents() {
    return Array.from(this.listeners.keys());
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Event constants to prevent typos
export const Events = {
  // Navigation
  STEP_CHANGED: 'step:changed',
  OFFER_STARTED: 'offer:started',
  OFFER_RESET: 'offer:reset',
  
  // Data
  PRICING_UPDATED: 'pricing:updated',
  FORM_CHANGED: 'form:changed',
  FORM_VALIDATED: 'form:validated',
  
  // UI
  TOAST_SHOW: 'toast:show',
  SIDEBAR_UPDATE: 'sidebar:update',
  WIDGET_UPDATE: 'widget:update',
  
  // Persistence
  DRAFT_SAVED: 'draft:saved',
  DRAFT_LOADED: 'draft:loaded',
  OFFER_EXPORTED: 'offer:exported',
};