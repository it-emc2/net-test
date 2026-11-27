// A tap or click outside an element (ADR 026: listeners on the document live in shared/, not in a
// feature). For lists that must not close on blur alone: Safari on the iPad does not focus a tapped
// button, so a field's blur names no next element.
import { useEffect, useRef, type RefObject } from "react";

/** calls `onOutside` when a pointer goes down outside `ref`'s element */
export function useOutsidePress(ref: RefObject<HTMLElement | null>, onOutside: () => void): void {
  const cb = useRef(onOutside);
  cb.current = onOutside;
  useEffect(() => {
    const down = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node | null)) cb.current(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [ref]);
}
