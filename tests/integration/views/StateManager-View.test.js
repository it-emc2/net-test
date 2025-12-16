// tests/integration/StateManager-View.test.js
import { stateManager } from '../../src/models/StateManager.js';
import { KundendatenView } from '../../src/views/pages/KundendatenView.js';
import { eventBus, Events } from '../../src/events/EventBus.js';

describe('StateManager + View Integration', () => {
  let view;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="page-kundendaten">
        <input name="firstName" type="text">
        <input name="lastName" type="text">
        <input name="email" type="email">
      </div>
    `;

    stateManager.resetForms();
    view = new KundendatenView();
  });

  afterEach(() => {
    view.destroy();
    document.body.innerHTML = '';
  });

  test('view updates reflect in state', () => {
    const input = view.$('[name="firstName"]');
    input.value = 'Max';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(stateManager.getField('Kundendaten', 'firstName')).toBe('Max');
  });

  test('state updates reflect in view', () => {
    stateManager.setField('Kundendaten', 'firstName', 'Erika');

    const input = view.$('[name="firstName"]');
    expect(input.value).toBe('Erika');
  });

  test('bulk state update syncs to view', () => {
    stateManager.setFormData('Kundendaten', {
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.com'
    });

    expect(view.$('[name="firstName"]').value).toBe('Max');
    expect(view.$('[name="lastName"]').value).toBe('Mustermann');
    expect(view.$('[name="email"]').value).toBe('max@example.com');
  });

  test('state persists and restores', () => {
    stateManager.setField('Kundendaten', 'firstName', 'Max');
    
    // Simulate page reload
    const saved = sessionStorage.getItem('emc2_wizard_state');
    expect(saved).toBeTruthy();

    stateManager.resetForms();
    stateManager.restore();

    expect(stateManager.getField('Kundendaten', 'firstName')).toBe('Max');
  });

  test('validation errors show in view', (done) => {
    view.showFieldError('email', 'Ungültige E-Mail');

    const input = view.$('[name="email"]');
    expect(input.classList.contains('error')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');

    const errorMsg = input.parentElement.querySelector('.error-message');
    expect(errorMsg.textContent).toBe('Ungültige E-Mail');
    
    done();
  });
});