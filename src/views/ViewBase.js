// src/views/ViewBase.js
import { eventBus } from '../events/EventBus.js';

export class ViewBase {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._eventSubscriptions = [];
    this._domListeners = [];
    
    if (!this.container) {
      console.warn(`[${this.constructor.name}] Container #${containerId} not found`);
    }
  }

  // Template method for subclasses
  render(data) {
    throw new Error('render() must be implemented by subclass');
  }

  // Safely add event listener with automatic cleanup tracking
  addListener(element, event, handler, options) {
    if (!element) return;
    const boundHandler = handler.bind(this);
    element.addEventListener(event, boundHandler, options);
    this._domListeners.push({ element, event, handler: boundHandler, options });
  }

  // Subscribe to EventBus with automatic cleanup tracking
  subscribe(event, handler) {
    const unsubscribe = eventBus.on(event, handler, this);
    this._eventSubscriptions.push(unsubscribe);
    return unsubscribe;
  }

  // Query within container
  $(selector) {
    return this.container?.querySelector(selector);
  }

  $$(selector) {
    return this.container?.querySelectorAll(selector) || [];
  }

  // Show/hide helpers
  show() {
    if (this.container) {
      this.container.hidden = false;
      this.container.setAttribute('aria-hidden', 'false');
    }
  }

  hide() {
    if (this.container) {
      this.container.hidden = true;
      this.container.setAttribute('aria-hidden', 'true');
    }
  }

  // Cleanup
  destroy() {
    // Remove DOM listeners
    this._domListeners.forEach(({ element, event, handler, options }) => {
      element.removeEventListener(event, handler, options);
    });
    this._domListeners = [];

    // Unsubscribe from EventBus
    this._eventSubscriptions.forEach(unsub => unsub());
    this._eventSubscriptions = [];
  }
}