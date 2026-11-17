// Step navigation chrome: the drawer (< lg) and the pinned sidebar (≥ lg). The burger in the header
// and the frame of the offer share this; the sidebar choice is remembered per device.
import { useEffect, useState } from "react";
import { create } from "zustand";

const KEY = "oc.sidebar";
const read = () => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } };

interface NavState { drawer: boolean; sidebar: boolean; setDrawer: (open: boolean) => void; toggleSidebar: () => void }
export const useNav = create<NavState>((set, get) => ({
  drawer: false,
  sidebar: read(),
  setDrawer: (drawer) => set({ drawer }),
  toggleSidebar: () => {
    const sidebar = !get().sidebar;
    try { localStorage.setItem(KEY, sidebar ? "1" : "0"); } catch { /* not remembered */ }
    set({ sidebar });
  },
}));

/** is the screen wide enough (lg, 1024 px) for the pinned sidebar? */
export function useWide(): boolean {
  const mq = () => (typeof matchMedia === "function" ? matchMedia("(min-width: 1024px)") : undefined);
  const [wide, setWide] = useState(() => mq()?.matches ?? false);
  useEffect(() => {
    const m = mq();
    if (!m?.addEventListener) return;
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
