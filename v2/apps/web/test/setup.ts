import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { usePrefs } from "../src/shared/lib/prefs.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useOfferStore.getState().close();
  localStorage.clear();
  usePrefs.setState({ theme: "", dark: false, autosave: true, offerType: null });
  delete document.documentElement.dataset.theme;
});
