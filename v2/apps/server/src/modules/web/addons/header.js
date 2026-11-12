/* v2 add-on — clean header (owner request 2026-11-06, UX U-008), on top of today's UI (ADR 021).
 *  Left: logo + title (unchanged). Right: save status + „Versionen“ (only while an offer is open)
 *  and one user menu: name/e-mail, Farbthema, Dunkler Modus, Ansicht, Automatisch speichern,
 *  App neu laden, Abmelden — one consistent style (label left, control right).
 *  Today's controls (theme select, light/dark switch, Klassisch/Neu, reload, logout) stay in the
 *  page, hidden; the menu's controls only operate them, so their behaviour is unchanged. */
(function () {
  "use strict";
  var header = document.querySelector("body > header");
  var controls = header && header.querySelector(".theme-controls");
  var userBox = document.getElementById("userBox");
  if (!header || !controls || !userBox) return;

  var css = [
    "body > header .theme-controls{display:flex;align-items:center;gap:12px;flex-wrap:nowrap}",
    // ---- save status slot
    "#ocSaveSlot{display:flex;align-items:center;gap:8px;min-width:0}",
    "#ocSaveSlot .conn-status{margin:0}",
    "#ocSaveSlot #ocAutosave{position:static!important;box-shadow:none!important;border:1px solid var(--border,#e5e7eb)!important;" +
      "border-radius:999px!important;padding:4px 6px 4px 14px!important;background:var(--card,#fff)!important;font-size:15px!important;max-width:none!important;gap:8px!important}",
    "#ocSaveSlot #ocAutosaveText{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}",
    "#ocSaveSlot #ocVersionsBtn{min-height:36px!important;padding:4px 12px!important;font-size:15px!important;border-radius:999px!important}",
    // ---- menu button
    "#userBox{position:relative;display:flex;align-items:center}",
    "#userBox[hidden]{display:none!important}",
    "#ocUserMenuBtn{display:flex;align-items:center;gap:10px;min-height:44px!important;padding:4px 12px 4px 4px;border-radius:999px;" +
      "border:1px solid var(--border,#e5e7eb);background:var(--card,#fff);color:var(--text,#111);cursor:pointer;font:inherit;font-size:16px!important}",
    "#ocUserMenuBtn:hover{background:var(--card-hover,#f5f7fa)}",
    "#ocUserMenuBtn .avatar{margin:0}",
    "#ocUserMenuBtn .oc-caret{font-size:12px;opacity:.6}",
    // ---- menu panel
    "#ocUserMenu{position:absolute;right:0;top:calc(100% + 8px);z-index:9700;width:340px;max-width:calc(100vw - 24px);padding:8px;border-radius:16px;" +
      "background:var(--panel,#fff);color:var(--text,#111);border:1px solid var(--border,#e5e7eb);box-shadow:0 16px 40px rgba(15,23,42,.18)}",
    "#ocUserMenu[hidden]{display:none!important}",
    "#ocUserMenu .oc-mu-head{display:flex;align-items:center;gap:12px;padding:10px 10px 12px}",
    "#ocUserMenu .oc-mu-av{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none;" +
      "background:var(--accent,#7C3AED);color:#fff;font-weight:700;font-size:15px}",
    "#ocUserMenu .oc-mu-name{font-weight:700;font-size:16px;line-height:1.2}",
    "#ocUserMenu .oc-mu-mail{font-size:14px;color:var(--muted,#6b7280);line-height:1.3;word-break:break-all}",
    "#ocUserMenu .oc-mu-sec{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#6b7280);padding:12px 10px 4px}",
    "#ocUserMenu .oc-mu-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;padding:4px 10px;border-radius:10px}",
    "#ocUserMenu .oc-mu-label{font-size:16px;line-height:1.3}",
    "#ocUserMenu .oc-mu-hint{display:block;font-size:13px;color:var(--muted,#6b7280);margin-top:2px}",
    "#ocUserMenu hr{border:0;border-top:1px solid var(--border,#e5e7eb);margin:8px 4px}",
    // select
    "#ocUserMenu .oc-mu-select{min-height:40px!important;height:40px;border:1px solid var(--border,#d1d5db);border-radius:10px;padding:0 12px;" +
      "background:var(--panel,#fff);color:var(--text,#111);font:inherit;font-size:15px!important;cursor:pointer}",
    // switch
    "#ocUserMenu .oc-switch{position:relative;width:46px;height:28px;flex:none}",
    "#ocUserMenu .oc-switch input{position:absolute;inset:0;width:100%!important;height:100%!important;margin:0;opacity:0;cursor:pointer;min-height:0!important}",
    "#ocUserMenu .oc-switch span{position:absolute;inset:0;border-radius:999px;background:var(--border,#d1d5db);transition:background .15s}",
    "#ocUserMenu .oc-switch span::after{content:'';position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;" +
      "box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s}",
    "#ocUserMenu .oc-switch input:checked+span{background:var(--accent,#7C3AED)}",
    "#ocUserMenu .oc-switch input:checked+span::after{transform:translateX(18px)}",
    "#ocUserMenu .oc-switch input:focus-visible+span{outline:3px solid var(--ring,rgba(124,58,237,.35));outline-offset:2px}",
    // segmented
    "#ocUserMenu .oc-seg{display:inline-flex;padding:3px;gap:2px;border-radius:12px;background:var(--card-hover,#f1f5f9);border:1px solid var(--border,#e5e7eb)}",
    "#ocUserMenu .oc-seg button{min-height:34px!important;padding:4px 14px;border:0;border-radius:9px;background:transparent;color:var(--text,#111);" +
      "font:inherit;font-size:15px!important;font-weight:600;cursor:pointer}",
    "#ocUserMenu .oc-seg button[aria-pressed=true]{background:var(--accent,#7C3AED);color:#fff;box-shadow:0 1px 3px rgba(15,23,42,.18)}",
    // actions
    "#ocUserMenu .oc-mu-item{display:flex;align-items:center;gap:12px;width:100%;min-height:48px!important;padding:8px 10px;border:0;border-radius:10px;" +
      "background:transparent;color:var(--text,#111);font:inherit;font-size:16px!important;font-weight:500;text-align:left;cursor:pointer}",
    "#ocUserMenu .oc-mu-item i{width:20px;text-align:center;color:var(--muted,#6b7280)}",
    "#ocUserMenu .oc-mu-item:hover,#ocUserMenu .oc-mu-item:focus-visible,#ocUserMenu label.oc-mu-row:hover{background:var(--card-hover,#f5f7fa)}",
    "#ocUserMenu .oc-mu-item.oc-danger,#ocUserMenu .oc-mu-item.oc-danger i{color:var(--danger-base,#dc2626)}",
    "#ocUserMenu .oc-legacy{display:none!important}",
    "@media (max-width:700px){#ocSaveSlot #ocAutosaveText{max-width:22vw}#ocUserMenuBtn .user-name{display:none}}",
  ].join("\n");
  var st = document.createElement("style");
  st.id = "ocHeaderStyles"; st.textContent = css;
  document.head.appendChild(st);

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === "text") e.textContent = props[k]; else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function switchCtl(id, label) {
    var input = el("input", { type: "checkbox", id: id, role: "switch", "aria-label": label });
    return { wrap: el("span", { class: "oc-switch" }, [input, el("span", { "aria-hidden": "true" })]), input: input };
  }

  // ---- save status slot (filled by deal-draft.js) — connection dot moves next to it
  var slot = el("div", { id: "ocSaveSlot" });
  var conn = document.getElementById("connStatus");
  if (conn) slot.appendChild(conn);
  controls.insertBefore(slot, userBox);

  // ---- today's controls (kept, hidden, operated by the menu)
  var avatar = document.getElementById("userAvatar");
  var name = document.getElementById("userName");
  var logout = document.getElementById("logoutBtn");
  var refresh = document.getElementById("hardRefreshBtn");
  var themeSel = document.getElementById("themeSelect");
  var modeToggle = document.getElementById("modeToggle");
  var themeGroup = controls.querySelector(".ctl-group");
  var viewSeg = controls.querySelector(".ui-view-seg");
  var legacy = el("div", { class: "oc-legacy", "aria-hidden": "true" }, [themeGroup, viewSeg, refresh, logout]);

  // ---- button: avatar + name
  var btn = el("button", { type: "button", id: "ocUserMenuBtn", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": "ocUserMenu" });
  if (avatar) btn.appendChild(avatar);
  if (name) btn.appendChild(name);
  btn.appendChild(el("span", { class: "oc-caret", "aria-hidden": "true", text: "▾" }));

  // ---- panel
  var menu = el("div", { id: "ocUserMenu", role: "menu", hidden: "" });
  var headName = el("div", { class: "oc-mu-name" }), headMail = el("div", { class: "oc-mu-mail" }), headAv = el("div", { class: "oc-mu-av", "aria-hidden": "true" });
  menu.appendChild(el("div", { class: "oc-mu-head" }, [headAv, el("div", {}, [headName, headMail])]));

  menu.appendChild(el("div", { class: "oc-mu-sec", text: "Darstellung" }));
  var theme = el("select", { class: "oc-mu-select", id: "ocThemeSelect", "aria-label": "Farbthema" });
  if (themeSel) Array.prototype.forEach.call(themeSel.options, function (o) { theme.appendChild(el("option", { value: o.value, text: o.textContent })); });
  theme.addEventListener("change", function () {
    if (!themeSel) return;
    themeSel.value = theme.value;
    themeSel.dispatchEvent(new Event("change", { bubbles: true }));
  });
  menu.appendChild(el("label", { class: "oc-mu-row", for: "ocThemeSelect" }, [el("span", { class: "oc-mu-label", text: "Farbthema" }), theme]));

  var dark = switchCtl("ocDarkToggle", "Dunkler Modus");
  dark.input.addEventListener("change", function () {
    if (!modeToggle) return;
    modeToggle.checked = dark.input.checked;
    modeToggle.dispatchEvent(new Event("change", { bubbles: true }));
  });
  menu.appendChild(el("label", { class: "oc-mu-row", for: "ocDarkToggle" }, [el("span", { class: "oc-mu-label", text: "Dunkler Modus" }), dark.wrap]));

  var seg = el("div", { class: "oc-seg", role: "group", "aria-label": "Ansicht" });
  [["classic", "Klassisch"], ["new", "Neu"]].forEach(function (v) {
    seg.appendChild(el("button", { type: "button", "data-view": v[0], "aria-pressed": "false", text: v[1], onclick: function () {
      var orig = viewSeg && viewSeg.querySelector('[data-ui-view="' + v[0] + '"]');
      if (orig) orig.click(); // today's handler listens on document
      sync();
    } }));
  });
  menu.appendChild(el("div", { class: "oc-mu-row" }, [el("span", { class: "oc-mu-label", text: "Ansicht" }), seg]));

  var autoRow = null, auto = null;
  if (window.__ocDealDraft && window.__ocDealDraft.setAutosave) {
    menu.appendChild(el("div", { class: "oc-mu-sec", text: "Speichern" }));
    auto = switchCtl("ocAutosaveToggle", "Automatisch speichern");
    auto.input.addEventListener("change", function () { window.__ocDealDraft.setAutosave(auto.input.checked); });
    autoRow = el("label", { class: "oc-mu-row", for: "ocAutosaveToggle" }, [
      el("span", { class: "oc-mu-label" }, [document.createTextNode("Automatisch speichern"),
        el("span", { class: "oc-mu-hint", text: "Aus: Sie speichern selbst mit „Speichern“ unten." })]),
      auto.wrap]);
    menu.appendChild(autoRow);
  }

  menu.appendChild(el("hr", {}));
  if (refresh) menu.appendChild(el("button", { type: "button", class: "oc-mu-item", role: "menuitem", onclick: function () { refresh.click(); } },
    [el("i", { class: "fa-solid fa-rotate-right", "aria-hidden": "true" }), el("span", { text: "App neu laden" })]));
  if (logout) menu.appendChild(el("button", { type: "button", class: "oc-mu-item oc-danger", role: "menuitem", onclick: function () { logout.click(); } },
    [el("i", { class: "fa-solid fa-right-from-bracket", "aria-hidden": "true" }), el("span", { text: "Abmelden" })]));
  menu.appendChild(legacy);

  userBox.textContent = "";
  userBox.appendChild(btn);
  userBox.appendChild(menu);

  // ---- keep the menu in step with today's controls and the logged-in user
  var email = "";
  fetch("/api/auth/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) { if (j && j.user) { email = j.user.email || ""; sync(); } }).catch(function () {});
  function sync() {
    var n = (name && name.textContent.trim()) || "";
    headName.textContent = n || email;
    headMail.textContent = n ? email : "";
    headAv.textContent = (avatar && avatar.textContent.trim()) || (n || email).slice(0, 2).toUpperCase();
    if (themeSel) theme.value = themeSel.value;
    if (modeToggle) dark.input.checked = !!modeToggle.checked;
    var classic = document.body.classList.contains("ui-classic");
    seg.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String((b.dataset.view === "classic") === classic)); });
    if (auto) auto.input.checked = window.__ocDealDraft.isAutosave();
  }

  function setOpen(open) {
    if (open) sync();
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !userBox.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
  // settings keep the menu open (people try options); reload/logout close it
  menu.addEventListener("click", function (e) { if (e.target.closest(".oc-mu-item")) setOpen(false); });
})();
