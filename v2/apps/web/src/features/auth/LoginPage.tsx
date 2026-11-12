import { useState, type FormEvent } from "react";
import { Alert, Button, Card, Field, Page } from "../../shared/ui/index.js";
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
      <Card>
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="E-Mail" id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Passwort" id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {login.error ? <Alert kind="error">{login.error.message}</Alert> : null}
        <Button type="submit" disabled={login.isPending}>{login.isPending ? "Anmeldung läuft …" : "Anmelden"}</Button>
      </form>
      </Card>
    </Page>
  );
}
