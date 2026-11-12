// Inputs bound to ONE field of the offer. Each reads only its own value (narrow selector), so
// typing in one field re-renders that field and nothing else (ADR 026).
import type { InputHTMLAttributes } from "react";
import { useOfferField, useOfferStore } from "../offer/index.js";
import { Choices, Field } from "../../shared/ui/index.js";

type Section = Parameters<ReturnType<typeof useOfferStore.getState>["patch"]>[0];
const patch = (section: string, fields: Record<string, unknown>) => useOfferStore.getState().patch(section as Section, fields as never);

export function OfferText({ section, name, label, ...rest }: { section: string; name: string; label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange" | "id">) {
  const value = useOfferField<string>(section, name) ?? "";
  return <Field label={label} id={`${section}-${name}`} name={name} value={value} onChange={(e) => patch(section, { [name]: e.target.value })} {...rest} />;
}

type Option = string | { value: string; label: string };
const opt = (o: Option) => (typeof o === "string" ? { value: o, label: o } : o);

export function OfferChoice({ section, name, label, options, required, onChoose }: {
  section: string; name: string; label: string; options: readonly Option[]; required?: boolean;
  /** replaces the plain "store the value" — for a choice that changes more than its own field */
  onChoose?: (value: string) => void;
}) {
  const value = useOfferField<string>(section, name);
  return (
    <Choices
      legend={label} name={`${section}-${name}`} options={options.map(opt)} value={value} required={required}
      onChange={(v) => (onChoose ? onChoose(v) : patch(section, { [name]: v }))}
    />
  );
}
