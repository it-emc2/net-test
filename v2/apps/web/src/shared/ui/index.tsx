// The UI kit: shadcn/ui components (button, input, card, alert, toaster) themed with today's
// colours, plus the few compositions the screens use everywhere.
import type { InputHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";
import { cn } from "../lib/cn.js";
import { Alert } from "./alert.js";
import { Button, buttonVariants } from "./button.js";
import { Card, CardTitle } from "./card.js";
import { Input, Label } from "./input.js";

export { Alert, Button, Card, CardTitle, Input, Label, buttonVariants };
// toasts live in ./toaster.js and are imported from there directly: the toast library is loaded
// with the first screen that needs it, not with the start script
export { cn };

export function Page({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <main className="mx-auto grid max-w-3xl gap-4 px-4 pb-16 pt-8">
      <h1>{title}</h1>
      {lead ? <p className="text-lg text-muted-foreground">{lead}</p> : null}
      {children}
    </main>
  );
}

/** A link that looks like a secondary button. */
export function ButtonLink({ className, ...props }: LinkProps) {
  return <Link {...props} className={cn(buttonVariants({ variant: "secondary" }), className)} />;
}

/** Label + input + optional hint, wired for screen readers. */
export function Field({ label, id, hint, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string | undefined }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint ? <p className="text-[0.95rem] text-muted-foreground" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

/** @deprecated name kept for the first screens — same as Alert */
export const Notice = Alert;

/** A large tile on the Hauptmenü. */
export function Tile({ to, title, text }: { to: string; title: string; text?: string }) {
  return (
    <Link to={to} className="grid min-h-24 content-center gap-1 rounded-lg border-2 border-border bg-card px-5 py-4 text-card-foreground no-underline transition-colors hover:border-accent hover:bg-accent-weak">
      <span className="text-xl font-bold">{title}</span>
      {text ? <span className="text-muted-foreground">{text}</span> : null}
    </Link>
  );
}

/** One question with a few answers, as large tappable pills (native radio buttons). */
export function Choices({ legend, name, options, value, onChange, required }: {
  legend: string; name: string; value: string | undefined; required?: boolean | undefined;
  options: readonly { value: string; label: string }[]; onChange: (value: string) => void;
}) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 border-input bg-card px-4 has-[:checked]:border-primary has-[:checked]:bg-accent-weak has-[:checked]:font-bold">
            <input type="radio" className="size-5 accent-[var(--primary)]" name={name} value={o.value} checked={value === o.value} required={required} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** An on/off switch (a native checkbox, so it works with keyboard and screen readers as it is). */
export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <span className="relative inline-block h-7 w-12 shrink-0">
      <input id={id} type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0" />
      <span aria-hidden className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
      <span aria-hidden className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </span>
  );
}

/** A tick box with a large tappable row. */
export function Check({ id, checked, onChange, disabled, children }: { id: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean | undefined; children: ReactNode }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 border-input bg-card px-4 py-2 has-[:checked]:border-primary has-[:checked]:bg-accent-weak has-[:checked]:font-bold", disabled && "cursor-default opacity-60")}>
      <input id={id} type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
