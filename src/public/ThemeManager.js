// ThemeManager.js
// Decouples theme (domain palette) + mode (light/dark) persistence and UI wiring.
//
// Usage (non-module):
//   1) Include BEFORE script.js:
//        <script src="./ThemeManager.js"></script>
//   2) In script.js call:
//        window.__themeManager = window.initThemeManager({ getOfferType: () => window.getCurrentOfferType?.() || 'bu' });

(function (global) {
  "use strict";

  function initThemeManager(options) {
    const cfg = Object.assign(
      {
        // storage keys
        themeKey: "emc2.theme",
        modeKey: "emc2.mode",

        // DOM ids
        ids: {
          themeSelect: "themeSelect",
          modeToggle: "modeToggle",
          themeLabel: "themeLabel",
        },

        // default theme per offer type (only used if nothing stored yet)
        offerDefaults: {
          bu: "wohnen",
          bwt: "gesundheit",
          ah: "pflege",
          hl: "pflege",
          kfz: "kfz",
        },

        // how to detect offer type (override from script.js)
        getOfferType: function () {
          // 1) prefer your global getter if present
          if (typeof global.getCurrentOfferType === "function") {
            return global.getCurrentOfferType() || "bu";
          }
          // 2) legacy globals
          if (global.currentOfferType) return global.currentOfferType;
          // 3) optional DOM hint
          const el = document.querySelector("[data-offer-type-current]");
          return el?.getAttribute("data-offer-type-current") || "bu";
        },
      },
      options || {},
    );

    const root = document.documentElement;
    const themeSelect = document.getElementById(cfg.ids.themeSelect);
    const modeToggle = document.getElementById(cfg.ids.modeToggle);
    const themeLabel = document.getElementById(cfg.ids.themeLabel);

    function safeGet(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }

    function safeSet(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {}
    }

    function setTheme(theme, opts) {
      const { save = true } = opts || {};
      if (!theme) return;
      root.dataset.theme = theme;
      if (themeSelect) themeSelect.value = theme;
      if (save) safeSet(cfg.themeKey, theme);
    }

    function setMode(mode, opts) {
      const { save = true } = opts || {};
      if (!mode) return;
      root.dataset.mode = mode;
      if (modeToggle) modeToggle.checked = mode === "dark";
      if (themeLabel) themeLabel.textContent = mode === "dark" ? "Dark" : "Light";
      if (save) safeSet(cfg.modeKey, mode);
    }

    function initFromDefaults() {
      let theme = safeGet(cfg.themeKey);
      let mode = safeGet(cfg.modeKey);

      if (!theme) {
        const offer = String(cfg.getOfferType?.() || "bu").trim().toLowerCase();
        theme = cfg.offerDefaults[offer] || "base";
      }
      if (!mode) mode = "light";

      setTheme(theme, { save: false });
      setMode(mode, { save: false });
    }

    // Wire UI
    if (themeSelect) {
      themeSelect.addEventListener("change", (e) => setTheme(e.target.value));
    }
    if (modeToggle) {
      modeToggle.addEventListener("change", (e) =>
        setMode(e.target.checked ? "dark" : "light"),
      );
    }

    initFromDefaults();

    // Public API (useful for nav / offer switch)
    return {
      setTheme,
      setMode,
      // If you want to change defaults when user switches offer type,
      // call this. It will only apply if the user hasn't chosen a theme.
      applyDefaultForOffer(offerType) {
        const stored = safeGet(cfg.themeKey);
        if (stored) return;
        const offer = String(offerType || "bu").trim().toLowerCase();
        setTheme(cfg.offerDefaults[offer] || "base");
      },
      getTheme() {
        return root.dataset.theme || "base";
      },
      getMode() {
        return root.dataset.mode || "light";
      },
    };
  }

  global.initThemeManager = initThemeManager;
})(window);
