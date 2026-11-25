// The customer signing page (/sign/<token>, SIGNING_UI=react) — today's src/public/signpage as
// a React page. Public: no login, no app header or menu, no link into the app (except "Zurück
// zum Konfigurator" for a rep whose session the server saw). It reaches only the signing routes
// of its own token (api.ts). States and rules: rules.ts; inventory: MODULARIZATION-PLAN.md.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../../shared/ui/button.js";
import { DocumentView } from "./DocumentView.js";
import { SignApiError, documentHtml, loadRequest, requestNewLink, type SubmitAnswer } from "./api.js";
import type { Clipboard } from "./SignatureField.js";
import { TEXT, nextOpen, progressText, tokenFromPath, type SignDoc } from "./rules.js";
import "./sign.css";

type Screen =
  | { kind: "loading" }
  | { kind: "fatal"; message: string }
  | { kind: "expired"; requested: boolean }
  | { kind: "app"; done: boolean };

const toTop = () => { try { window.scrollTo(0, 0); } catch { /* not in every environment */ } };

export function SignPage({ pathname = window.location.pathname, internal = document.body.dataset.internalUser === "true", company = companyOfPage() }: { pathname?: string; internal?: boolean; company?: string }) {
  const [token] = useState(() => tokenFromPath(pathname));
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [docs, setDocs] = useState<SignDoc[]>([]);
  const [offerNumber, setOfferNumber] = useState<string | null>(null);
  const [at, setAt] = useState({ index: 0, max: 0 });
  /** the shown document: its HTML, null while it loads, false when it could not be loaded */
  const [html, setHtml] = useState<string | null | false>(null);
  const clipboard = useRef<Clipboard>({ current: null }).current;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // once per page (React's development double start)
    started.current = true;
    if (!token) return setScreen({ kind: "fatal", message: TEXT.invalidLink });
    loadRequest(token).then((data) => {
      const list = (data.documents || []).slice();
      setDocs(list);
      setOfferNumber(data.offerNumber || null);
      const first = nextOpen(list, 0);
      if (data.completed || first >= list.length) return setScreen({ kind: "app", done: true });
      setAt({ index: first, max: first });
      setScreen({ kind: "app", done: false });
    }, (e: unknown) => {
      const body = e instanceof SignApiError ? e.body : null;
      if (body?.expired) return setScreen({ kind: "expired", requested: !!body.newLinkRequested });
      setScreen({ kind: "fatal", message: (e as Error).message || TEXT.linkFallback });
    });
  }, [token]);

  const current = screen.kind === "app" && !screen.done ? docs[at.index] : undefined;
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    if (!current) return;
    let live = true;
    setHtml(null);
    void documentHtml(token, current.key).then((h) => {
      if (!live) return;
      setHtml(h ?? false);
      setLoads((n) => n + 1);
      toTop();
    });
    return () => { live = false; };
  }, [token, current?.key, at.index]); // eslint-disable-line react-hooks/exhaustive-deps

  const signed = (answer: SubmitAnswer) => {
    const list = docs.map((d, i) => (i === at.index ? { ...d, status: "signed" } : d));
    setDocs(list);
    if (answer.completed || answer.status === "completed") { setScreen({ kind: "app", done: true }); toTop(); return; }
    const next = nextOpen(list, at.index + 1);
    if (next >= list.length) { setScreen({ kind: "app", done: true }); toTop(); return; }
    setAt({ index: next, max: Math.max(at.max, next) });
  };
  const go = (i: number) => {
    if (i < 0 || i > at.max || i >= docs.length || i === at.index) return;
    setAt({ index: i, max: at.max });
  };

  return (
    <div className="sign-page min-h-dvh bg-background px-1.5 py-2.5 text-[#111] sm:px-3 sm:py-6">
      {screen.kind === "loading" ? <Sheet><p id="loading">{TEXT.loading}</p></Sheet> : null}
      {screen.kind === "fatal" ? (
        <Sheet><p id="fatal" role="alert" className="whitespace-pre-line border border-[#b71c1c] bg-[#fdecea] px-3.5 py-3 text-[#7f1d1d]">{screen.message}</p></Sheet>
      ) : null}
      {screen.kind === "expired" ? <Expired token={token} requested={screen.requested} company={company} /> : null}
      {screen.kind === "app" ? (
        <Sheet as="main">
          <header className="mb-1">
            {internal ? (
              <a id="backToOc" href={offerNumber ? `/?offer=${encodeURIComponent(offerNumber)}` : "/"} className="mb-3.5 inline-flex min-h-11 items-center text-base text-[#333] underline">
                {TEXT.backToOc}
              </a>
            ) : null}
            <h1 className="title font-mono text-sm font-normal text-[#333]">{TEXT.title}</h1>
          </header>
          {!screen.done && docs.length > 1 ? (
            <nav id="docNav" aria-label="Dokumente" className="my-3.5 flex items-center justify-between gap-2.5">
              <Button variant="outline" id="prevDoc" disabled={at.index <= 0} onClick={() => go(at.index - 1)}>{TEXT.prev}</Button>
              <span id="progress" aria-live="polite" className="text-center font-mono text-sm text-[#333]">{progressText(docs, at.index)}</span>
              <Button variant="outline" id="nextDoc" disabled={at.index >= at.max} onClick={() => go(at.index + 1)}>{TEXT.next}</Button>
            </nav>
          ) : null}
          {!screen.done && current ? (
            <div id="docContainer">
              {html === null ? <p>{TEXT.loading}</p> : html === false ? <p role="alert">{TEXT.docFailed}</p> : (
                <DocumentView key={`${at.index}:${loads}`} token={token} doc={current} html={html} clipboard={clipboard} onSigned={signed} />
              )}
            </div>
          ) : null}
          {screen.done ? (
            <div id="doneCard" role="status" className="border border-[#2e7d32] bg-[#e6f6e6] px-3.5 py-3 text-[#1b5e20]">
              <strong>{TEXT.done[0]}</strong> {TEXT.done[1]}
            </div>
          ) : null}
        </Sheet>
      ) : null}
    </div>
  );
}

function Sheet({ as: Tag = "div", children }: { as?: "div" | "main"; children: ReactNode }) {
  return <Tag className="sign-paper mx-auto mb-5 max-w-[880px] overflow-x-auto border border-black bg-white px-3.5 pt-2.5 pb-6 sm:px-12 sm:pb-16 lg:px-[100px] lg:pb-[100px]">{children}</Tag>;
}

/** expired (or closed) link: today's contact block and the one-click request for a new link */
function Expired({ token, requested, company }: { token: string; requested: boolean; company: string }) {
  const [state, setState] = useState<{ sending: boolean; done: boolean; error: string | null }>({ sending: false, done: requested, error: null });
  const ask = () => {
    setState({ sending: true, done: false, error: null });
    requestNewLink(token).then(
      () => setState({ sending: false, done: true, error: null }),
      (e: Error) => setState({ sending: false, done: false, error: e.message || TEXT.requestFailed }),
    );
  };
  return (
    <Sheet>
      <div id="expired">
        <h1 className="mt-4 mb-2.5 text-xl font-bold">{TEXT.expiredHeading}</h1>
        <p>{TEXT.expiredIntro}</p>
        {!state.done ? (
          <p className="mt-4"><Button size="lg" id="requestNewLink" disabled={state.sending} onClick={ask}>{state.sending ? TEXT.requesting : TEXT.requestNewLink}</Button></p>
        ) : null}
        {state.done || state.error ? (
          <p id="requestNewLinkMsg" role="status" data-kind={state.done ? "success" : "error"} className={state.error && !state.done ? "mt-4 whitespace-pre-line border border-[#b71c1c] bg-[#fdecea] px-3.5 py-3 text-[#7f1d1d]" : "mt-4 border border-[#2e7d32] bg-[#e6f6e6] px-3.5 py-3 text-[#1b5e20]"}>
            {state.done ? TEXT.requested : state.error}
          </p>
        ) : null}
        <p className="contact mt-6 text-base leading-relaxed text-[#333]">
          Fragen? Wir helfen gern:<br />
          <strong>{company}</strong><br />
          Waldstr. 5, 95032 Hof<br />
          Tel.: <a className="underline" href="tel:+4992815915900">+49 9281 5915900</a><br />
          E-Mail: <a className="underline" href="mailto:service@e-m-c-2.de">service@e-m-c-2.de</a>
        </p>
      </div>
    </Sheet>
  );
}
/** the company line: the setting COMPANY_NAME, handed over by the server as `data-company` on the
 *  page (U-071); without it (a page not served by the server) the short name (U-068) */
const COMPANY_FALLBACK = "EmC2";
const companyOfPage = () => { try { return document.body.dataset.company?.trim() || COMPANY_FALLBACK; } catch { return COMPANY_FALLBACK; } };
