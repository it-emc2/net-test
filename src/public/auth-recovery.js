// auth-recovery.js
// A save request came back 401: the session cookie expired mid-edit. Flush the
// in-progress payload into the session-recovery snapshot (so it survives the
// redirect) and send the user to log back in. `pendingKind` lets
// session-recovery auto-resave once the user restores after re-login.
//
// Shared by every interactive save call site (script.js, DraftsManager.js,
// ExportManager.js) so an expired session is handled the same way everywhere,
// instead of surfacing as a generic "save failed" error that gives no clue
// the work is still safe and re-login is all that's needed.
export async function handleSaveAuthExpired(res, pendingKind) {
  if (!res || res.status !== 401) return false;
  try {
    const sr = await import("./session-recovery.js");
    await sr.__internals.flush();
  } catch (err) {
    console.warn("[save] could not flush session-recovery before redirect:", err);
  }
  try {
    sessionStorage.setItem("nt_resume_save_after_login", pendingKind);
  } catch {}
  window.toast?.warn?.(
    "Sitzung abgelaufen",
    "Ihre Eingaben wurden gesichert. Bitte melden Sie sich erneut an.",
  );
  const next = encodeURIComponent(location.pathname + location.search);
  setTimeout(() => {
    window.location.href = `/login?next=${next}`;
  }, 1500);
  return true;
}
