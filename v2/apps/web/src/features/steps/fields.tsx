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

export function OfferChoice({ section, name, label, options, required, onChoose }: {
  section: string; name: string; label: string; options: readonly string[]; required?: boolean;
  /** further fields that change together with this choice (same store update) */
  onChoose?: (value: string) => Record<string, unknown>;
}) {
  const value = useOfferField<string>(section, name);
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="choices">
        {options.map((o) => (
          <label className="choice" key={o}>
            <input
              type="radio" name={`${section}-${name}`} value={o} checked={value === o} required={required}
              onChange={() => patch(section, { [name]: o, ...(onChoose ? onChoose(o) : {}) })}
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
