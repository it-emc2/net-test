/* Ansprechpartner selector (home page).
   Populates from /api/users, defaults to the logged-in user (/api/auth/me),
   and feeds the offer: sets #emc2_contact (name) + #ansprechpartnerEmail
   (email) so the printed Ansprechpartner, the email "Freundliche Grüße" name,
   and (later) the per-user signature all follow the selection. */
(function () {
  "use strict";
  var sel = document.getElementById("homeAnsprechpartner");
  if (!sel) return;

  var users = [];

  function apply(email) {
    var u = users.find(function (x) { return x.email === email; });
    var nameEl = document.getElementById("emc2_contact");
    var emailEl = document.getElementById("ansprechpartnerEmail");
    if (u && nameEl) nameEl.value = u.name || "";
    if (emailEl) emailEl.value = u ? u.email : "";
    // let other listeners (email preview etc.) react to the name change
    if (nameEl) nameEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  Promise.all([
    fetch("/api/users", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : []; }),
    fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }),
  ])
    .then(function (res) {
      users = Array.isArray(res[0]) ? res[0] : [];
      var me = res[1] && res[1].user ? res[1].user : null;

      sel.innerHTML = users
        .map(function (u) { return '<option value="' + u.email + '">' + (u.name || u.email) + "</option>"; })
        .join("");

      // If an offer is already loaded (name filled), sync to it; else default
      // to the logged-in user without overwriting a loaded value.
      var nameEl = document.getElementById("emc2_contact");
      if (nameEl && nameEl.value.trim()) {
        syncFromOffer();
      } else {
        var defaultEmail = me && me.email ? me.email : (users[0] && users[0].email);
        if (defaultEmail) { sel.value = defaultEmail; apply(defaultEmail); }
      }
    })
    .catch(function () { /* not logged in / no users */ });

  // Re-select the dropdown from a loaded offer (called after restore).
  function syncFromOffer() {
    var emailEl = document.getElementById("ansprechpartnerEmail");
    var email = emailEl && emailEl.value ? emailEl.value : "";
    if (!email) {
      // legacy offers store only the name in emc2_contact
      var nm = ((document.getElementById("emc2_contact") || {}).value || "").trim();
      var byName = users.find(function (x) { return x.name === nm; });
      if (byName) email = byName.email;
    }
    if (email && users.find(function (x) { return x.email === email; })) {
      sel.value = email;
      var emailEl2 = document.getElementById("ansprechpartnerEmail");
      if (emailEl2) emailEl2.value = email;
    }
  }
  window.syncAnsprechpartner = syncFromOffer;

  sel.addEventListener("change", function () { apply(sel.value); });
})();
