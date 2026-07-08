/* Ansprechpartner selector(s): home header + Zusammenfassung header, kept in
   sync. Populates from /api/users, defaults to the logged-in user
   (/api/auth/me), and feeds the offer: sets #emc2_contact (name) +
   #ansprechpartnerEmail (email) so the printed Ansprechpartner, the email
   "Freundliche Grüße" name, and the per-user signature all follow it. */
(function () {
  "use strict";
  var selectors = ["homeAnsprechpartner", "zfAnsprechpartner"];
  var sels = selectors.map(function (id) { return document.getElementById(id); }).filter(Boolean);
  if (!sels.length) return;

  var users = [];

  function setAll(email) {
    sels.forEach(function (s) { s.value = email; });
  }

  function apply(email) {
    var u = users.find(function (x) { return x.email === email; });
    var nameEl = document.getElementById("emc2_contact");
    var emailEl = document.getElementById("ansprechpartnerEmail");
    if (u && nameEl) nameEl.value = u.name || "";
    if (emailEl) emailEl.value = u ? u.email : "";
    if (nameEl) nameEl.dispatchEvent(new Event("input", { bubbles: true }));
    setAll(email);
  }

  Promise.all([
    fetch("/api/users", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : []; }),
    fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }),
  ])
    .then(function (res) {
      users = Array.isArray(res[0]) ? res[0] : [];
      var me = res[1] && res[1].user ? res[1].user : null;

      var opts = users
        .map(function (u) { return '<option value="' + u.email + '">' + (u.name || u.email) + "</option>"; })
        .join("");
      sels.forEach(function (s) { s.innerHTML = opts; });

      var nameEl = document.getElementById("emc2_contact");
      if (nameEl && nameEl.value.trim()) {
        syncFromOffer();
      } else {
        var defaultEmail = me && me.email ? me.email : (users[0] && users[0].email);
        if (defaultEmail) apply(defaultEmail);
      }
    })
    .catch(function () { /* not logged in / no users */ });

  // Re-select the dropdowns from a loaded offer (called after restore).
  function syncFromOffer() {
    var emailEl = document.getElementById("ansprechpartnerEmail");
    var email = emailEl && emailEl.value ? emailEl.value : "";
    if (!email) {
      var nm = ((document.getElementById("emc2_contact") || {}).value || "").trim();
      var byName = users.find(function (x) { return x.name === nm; });
      if (byName) email = byName.email;
    }
    if (email && users.find(function (x) { return x.email === email; })) {
      setAll(email);
      if (emailEl) emailEl.value = email;
    }
  }
  window.syncAnsprechpartner = syncFromOffer;

  sels.forEach(function (s) {
    s.addEventListener("change", function () { apply(s.value); });
  });
})();
