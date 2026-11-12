import { useRouteError } from "react-router";
import { ButtonLink, Notice, Page } from "../shared/ui/index.js";

export function ErrorPage() {
  const err = useRouteError();
  console.error("[oc] page error", err);
  return (
    <Page title="Das hat nicht funktioniert" lead="Die Seite konnte nicht angezeigt werden. Ihre Eingaben in anderen Angeboten sind davon nicht betroffen.">
      <Notice kind="error">{err instanceof Error ? err.message : "Unbekannter Fehler"}</Notice>
      <ButtonLink to="/">Zum Hauptmenü</ButtonLink>
    </Page>
  );
}

export function NotFoundPage() {
  return (
    <Page title="Nicht gefunden" lead="Diese Seite gibt es nicht.">
      <ButtonLink to="/">Zum Hauptmenü</ButtonLink>
    </Page>
  );
}
