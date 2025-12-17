// public/js/pages/kundendaten-init.js
import { KundendatenView } from '../../../src/views/pages/KundendatenView.js';
import { stateManager } from '../../../src/models/StateManager.js';

// Restore state on page load
stateManager.restore();

// Initialize view
const view = new KundendatenView();

// Expose for debugging
window.__EMC2_KUNDENDATEN__ = view;