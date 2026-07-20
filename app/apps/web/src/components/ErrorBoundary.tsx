import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional label for the area that failed, shown in the fallback. */
  area?: string;
}
interface State {
  error: Error | null;
}

// Contains render crashes so one broken step shows a readable message instead of
// blanking the whole app (white screen). Reset by giving it a `key` that changes
// when you navigate (see OfferBuilderPage) so leaving the step clears the error.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.area ? ` · ${this.props.area}` : ""}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="font-display text-lg font-semibold text-destructive">
            {this.props.area ? `Fehler im Bereich „${this.props.area}“` : "Etwas ist schiefgelaufen"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dieser Abschnitt konnte nicht geladen werden. Ihre Eingaben in anderen Schritten bleiben erhalten.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted/50 p-3 text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
          <Button className="mt-4" variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            Erneut versuchen
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
