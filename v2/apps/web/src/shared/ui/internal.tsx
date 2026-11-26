// Kundenmodus, the two pieces a page needs (shared/lib/customer-mode.ts holds the state):
//  - <Internal>…</Internal>: renders its children only while the Kundenmodus is off. Hidden means
//    NOT rendered, so neither a screen reader nor text selection reveals it. A new internal
//    element is one wrapper.
//  - <Internal notice>…</Internal>: the same, but in its place a calm note with a button that ends
//    the Kundenmodus — for a whole block or step that would otherwise vanish without a word.
//  - <Internal when={flag}>: only when the flag says so (e.g. a document marked `internal`).
//  - <Internal instead={text}>: shows `text` in its place (e.g. a quantity without its price).
import { EyeOff } from "lucide-react";
import type { ReactNode } from "react";
import { setCustomerMode, useCustomerMode } from "../lib/customer-mode.js";
import { Button } from "./button.js";
import { Card } from "./card.js";

export const HIDDEN_TEXT = "Im Kundenmodus ausgeblendet. Kundenmodus beenden, um Aufschlag und Kosten zu sehen.";
export const END_LABEL = "Kundenmodus beenden";

/** the note shown instead of a hidden block */
export function HiddenNotice({ testId = "customer-mode-notice" }: { testId?: string }) {
  return (
    <Card data-testid={testId} className="justify-items-start gap-3">
      <p className="m-0 flex items-start gap-2 text-muted-foreground">
        <EyeOff aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span>{HIDDEN_TEXT}</span>
      </p>
      <Button variant="outline" onClick={() => setCustomerMode(false)}>{END_LABEL}</Button>
    </Card>
  );
}

export function Internal({ children, notice = false, when = true, instead = null, testId }: { children: ReactNode; notice?: boolean; when?: boolean; instead?: ReactNode; testId?: string }) {
  const on = useCustomerMode();
  if (!on || !when) return <>{children}</>;
  return notice ? <HiddenNotice {...(testId ? { testId } : {})} /> : <>{instead}</>;
}
