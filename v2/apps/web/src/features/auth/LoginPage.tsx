import { useState, type FormEvent } from "react";
import { Field, Notice, Page } from "../../shared/ui/index.js";
import { useLogin } from "./session.js";

export function LoginPage() {
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email: email.trim(), password });
  };
  return (
    <Page title="Anmeldung" lead="Bitte melden Sie sich an.">
      <form className="card" onSubmit={submit}>
        <Field label="E-Mail" id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Passwort" id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {login.error ? <Notice kind="error">{login.error.message}</Notice> : null}
        <button type="submit" disabled={login.isPending}>{login.isPending ? "Anmeldung läuft …" : "Anmelden"}</button>
      </form>
    </Page>
  );
}
