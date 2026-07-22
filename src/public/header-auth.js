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
    .catch(redirectToLogin);

  logoutBtn.addEventListener("click", function () {
    fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
      .catch(function () {})
      .then(function () { window.location.href = "/login"; });
  });
})();
