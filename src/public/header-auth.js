/* Header auth widget: shows the logged-in user's name + a logout button. */
(function () {
  "use strict";
  var box = document.getElementById("userBox");
  var nameEl = document.getElementById("userName");
  var avatarEl = document.getElementById("userAvatar");
  var logoutBtn = document.getElementById("logoutBtn");
  if (!box || !nameEl || !logoutBtn) return;

  function initials(label) {
    var parts = String(label || "").trim().split(/[\s@._-]+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2);
    return (parts[0][0] + parts[1][0]);
  }

  function redirectToLogin() {
    // Never nest: on /login the URL already carries a next, and re-appending
    // it each hop grows the query string without bound.
    if (window.location.pathname === "/login") return;
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = "/login?next=" + next;
  }

  fetch("/api/auth/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.user) return redirectToLogin();
      var label = data.user.name || data.user.email || "";
      nameEl.textContent = label;
      if (avatarEl) avatarEl.textContent = initials(label);
      box.hidden = false;
    })
    .catch(function () {
      // A request that never reached the server says nothing about the
      // session. Offline this must not bounce to /login: the login page needs
      // the network anyway, so it would strand a technician mid-visit — and
      // with the shell cached it loops, each hop re-encoding the last next.
      // Leave the cached page in place; the session is re-checked on the next
      // load that has signal.
    });

  logoutBtn.addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .then(function () { window.location.href = "/login"; });
  });
})();
