import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { useOfferStore } from "../src/features/offer/index.js";
import { usePrefs } from "../src/shared/lib/prefs.js";

// a slow CI runner needs more than the default second to load a step's chunk and its catalogue
// (seen: duschabtrennung "switched on" still showing "Einen Moment …"); passing tests are not slowed
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  useOfferStore.getState().close();
  localStorage.clear();
  usePrefs.setState({ theme: "", dark: false, autosave: true, offerType: null });
  delete document.documentElement.dataset.theme;
});
