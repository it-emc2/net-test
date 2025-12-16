// src/controllers/NavigationController.js
import { eventBus, Events } from "../events/EventBus.js";
import { stateManager } from "../models/StateManager.js";
import { OFFERS } from "../config/offers.js";

export class NavigationController {
  constructor() {
    this._bindEvents();
  }

  _bindEvents() {
    // Handle hash changes
    window.addEventListener("hashchange", () => this._handleHashChange());

    // Handle initial load
    window.addEventListener("DOMContentLoaded", () => this._handleBoot());
  }

  getPagesForOffer(offerType) {
    const cfg = OFFERS[offerType];
    if (!cfg || !Array.isArray(cfg.pages)) return [];
    return cfg.pages.map((p) => (typeof p === "string" ? p : p.id));
  }

  normalizeStep(step, offerType) {
    const pages = this.getPagesForOffer(offerType);
    if (!pages.length) return null;
    if (step && pages.includes(step)) return step;
    return pages[0];
  }

  startOffer(offerType) {
    if (!OFFERS[offerType]) {
      console.warn(`[Navigation] Unknown offer type: ${offerType}`);
      return;
    }

    stateManager.resetForms();
    stateManager.setOfferType(offerType);

    const pages = this.getPagesForOffer(offerType);
    const firstStep = pages[0] || "home";

    this.navigateTo(firstStep);
    this._persistState();
  }

  navigateTo(step) {
    const offerType = stateManager.currentOfferType;

    if (step === "home") {
      this.goHome();
      return;
    }

    if (!offerType) {
      console.warn("[Navigation] No offer type set, cannot navigate to:", step);
      return;
    }

    const normalizedStep = this.normalizeStep(step, offerType);
    stateManager.setStep(normalizedStep);

    location.hash = normalizedStep;
    this._persistState();
  }

  navigateNext() {
    const { currentOfferType, currentStep } = stateManager;
    const pages = this.getPagesForOffer(currentOfferType);
    const currentIndex = pages.indexOf(currentStep);

    if (currentIndex < pages.length - 1) {
      this.navigateTo(pages[currentIndex + 1]);
    }
  }

  navigatePrev() {
    const { currentOfferType, currentStep } = stateManager;
    const pages = this.getPagesForOffer(currentOfferType);
    const currentIndex = pages.indexOf(currentStep);

    if (currentIndex > 0) {
      this.navigateTo(pages[currentIndex - 1]);
    }
  }

  goHome() {
    stateManager.setOfferType(null);
    stateManager.setStep("home");
    stateManager.resetForms();

    this._clearPersistedState();
    location.hash = "home";
  }

  _handleBoot() {
    const saved = this._loadPersistedState();
    const hash = (location.hash || "").replace("#", "");

    if (hash === "" || hash === "home") {
      this.goHome();
      return;
    }

    if (saved && saved.offerType) {
      stateManager.setOfferType(saved.offerType);
      const pages = this.getPagesForOffer(saved.offerType);

      // Respect deep link if valid
      const step = pages.includes(hash) ? hash : saved.step || pages[0];
      stateManager.setStep(step);

      location.hash = step;
    } else {
      this.goHome();
    }
  }

  _handleHashChange() {
    if (stateManager.isRestoring) return;

    const hash = (location.hash || "").replace("#", "");
    const { currentOfferType } = stateManager;

    if (hash === "" || hash === "home") {
      this.goHome();
      return;
    }

    if (!currentOfferType) {
      this.goHome();
      return;
    }

    const pages = this.getPagesForOffer(currentOfferType);
    if (!pages.includes(hash)) {
      // Invalid step for current offer, revert
      const currentStep = stateManager.currentStep;
      location.hash = currentStep;
      return;
    }

    stateManager.setStep(hash);
    this._persistState();
  }

  // Persistence helpers
  _persistState() {
    try {
      sessionStorage.setItem(
        "konfigurator_state_v1",
        JSON.stringify({
          offerType: stateManager.currentOfferType,
          step: stateManager.currentStep,
        }),
      );
    } catch (e) {
      console.warn("[Navigation] Failed to persist state:", e);
    }
  }

  _loadPersistedState() {
    try {
      const raw = sessionStorage.getItem("konfigurator_state_v1");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  _clearPersistedState() {
    try {
      sessionStorage.removeItem("konfigurator_state_v1");
    } catch (e) {
      console.warn("[Navigation] Failed to clear state:", e);
    }
  }
}

export const navigationController = new NavigationController();
