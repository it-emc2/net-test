// Small UI kit: large type, 48 px touch targets, visible focus (styles.css). No inline styles —
// the server's content security policy does not allow them.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router";

export function Page({ title, lead, children }: { title: string; lead?: string; children?: ReactNode }) {
  return (
    <main className="page">
      <h1>{title}</h1>
      {lead ? <p className="lead">{lead}</p> : null}
      {children}
    </main>
  );
}

export function Button({ variant = "primary", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return <button type="button" {...rest} className={variant === "secondary" ? "button-secondary" : undefined} />;
}

export function ButtonLink(props: LinkProps) {
  return <Link {...props} className="button-secondary" />;
}

export function Field({ label, id, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...rest} />
      {hint ? <p className="hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error"; children: ReactNode }) {
  return <p className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</p>;
}

export function Tile({ to, title, text }: { to: string; title: string; text?: string }) {
  return (
    <Link className="tile" to={to}>
      <span className="tile-title">{title}</span>
      {text ? <span className="tile-text">{text}</span> : null}
    </Link>
  );
}
