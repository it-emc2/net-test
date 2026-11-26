// Kundenmodus (quick win C7, owner 2026-11-26): while the customer watches the screen, everything
// internal (markup, purchase prices, Kalkulation, Warenkorb …) is not rendered. Display only —
// nothing in the offer, its prices or any request changes.
//  - per device, NOT in the offer: localStorage "oc.customerMode" = "on"; default off
//  - stays on across offers until switched off (no timer, no password)
//  - every component reads the same store; other tabs follow through the storage event
//  - storage blocked (private mode, quota): the choice holds for this page only
// Mark an internal element with <Internal> (shared/ui/internal.tsx), never with a CSS class.
import { create } from "zustand";

export const CUSTOMER_MODE_KEY = "oc.customerMode";

/** what this device has stored (false when the storage cannot be read) */
export const readCustomerMode = (): boolean => { try { return localStorage.getItem(CUSTOMER_MODE_KEY) === "on"; } catch { return false; } };
const write = (on: boolean) => {
  try { if (on) localStorage.setItem(CUSTOMER_MODE_KEY, "on"); else localStorage.removeItem(CUSTOMER_MODE_KEY); } catch { /* storage blocked: this page only */ }
};

interface CustomerMode { on: boolean; setOn(on: boolean): void; toggle(): void }

export const useCustomerModeStore = create<CustomerMode>()((set, get) => {
  try {
    window.addEventListener("storage", (e) => { if (e.key === CUSTOMER_MODE_KEY || e.key === null) set({ on: readCustomerMode() }); });
  } catch { /* no window: tests or server */ }
  return {
    on: readCustomerMode(),
    setOn: (on) => { write(on); set({ on }); },
    toggle: () => get().setOn(!get().on),
  };
});

/** true while the Kundenmodus is on */
export const useCustomerMode = (): boolean => useCustomerModeStore((s) => s.on);
/** switch it on or off (also outside React, e.g. from a button's handler) */
export const setCustomerMode = (on: boolean) => useCustomerModeStore.getState().setOn(on);
