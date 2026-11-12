// Inputs bound to ONE field of the offer. Each reads only its own value (narrow selector), so
// typing in one field re-renders that field and nothing else (ADR 026).
import type { InputHTMLAttributes } from "react";
import { useOfferField, useOfferStore } from "../offer/index.js";
import { Field } from "../../shared/ui/index.js";

type Section = Parameters<ReturnType<typeof useOfferStore.getState>["patch"]>[0];
const patch = (section: string, fields: Record<string, unknown>) => useOfferStore.getState().patch(section as Section, fields as never);

export function OfferText({ section, name, label, ...rest }: { section: string; name: string; label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange" | "id">) {
  const value = useOfferField<string>(section, name) ?? "";
  return <Field label={label} id={`${section}-${name}`} name={name} value={value} onChange={(e) => patch(section, { [name]: e.target.value })} {...rest} />;
}

type Option = string | { value: string; label: string };
const val = (o: Option) => (typeof o === "string" ? o : o.value);

export function OfferChoice({ section, name, label, options, required, onChoose }: {
  section: string; name: string; label: string; options: readonly Option[]; required?: boolean;
  /** replaces the plain "store the value" — for a choice that changes more than its own field */
  onChoose?: (value: string) => void;
}) {
  const value = useOfferField<string>(section, name);
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="choices">
        {options.map((o) => (
          <label className="choice" key={val(o)}>
            <input
              type="radio" name={`${section}-${name}`} value={val(o)} checked={value === val(o)} required={required}
              onChange={() => (onChoose ? onChoose(val(o)) : patch(section, { [name]: val(o) }))}
            />
            {typeof o === "string" ? o : o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
