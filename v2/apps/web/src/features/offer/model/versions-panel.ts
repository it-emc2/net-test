// Whether the „Versionen“ panel is open. Its own tiny module: the header and the step drawer open
// the panel without loading it (Versions.tsx is loaded on first use).
import { create } from "zustand";

interface PanelState { open: boolean; set: (open: boolean) => void }
export const useVersionsPanel = create<PanelState>((set) => ({ open: false, set: (open) => set({ open }) }));
export const openVersionsPanel = () => useVersionsPanel.getState().set(true);
export const closeVersionsPanel = () => useVersionsPanel.getState().set(false);
