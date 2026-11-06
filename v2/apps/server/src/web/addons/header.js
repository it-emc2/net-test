/* v2 add-on — clean header (owner request 2026-11-06, UX U-008), on top of today's UI (ADR 021).
 *  Left: logo + title (unchanged). Right: save status + „Versionen“ (only while an offer is open)
 *  and one user menu (name/avatar) that holds colour theme, light/dark, Klassisch/Neu,
 *  „App neu laden“ and „Abmelden“. The original controls are MOVED into the menu (not copied),
 *  so all their existing behaviour stays exactly as it is. */
(function () {
  "use strict";
  var header = document.querySelector("body > header");
  var controls = header && header.querySelector(".theme-controls");
  var userBox = document.getElementById("userBox");
  if (!header || !controls || !userBox) return;

  var css = [
    "body > header .theme-controls{display:flex;align-items:center;gap:12px;flex-wrap:nowrap}",
    "#ocSaveSlot{display:flex;align-items:center;gap:8px;min-width:0}",
    "#ocSaveSlot .conn-status{margin:0}",
    "#ocSaveSlot #ocAutosave{position:static!important;box-shadow:none!important;border:1px solid var(--border,#e5e7eb)!important;" +
      "border-radius:999px!important;padding:4px 6px 4px 14px!important;background:var(--card,#fff)!important;font-size:15px!important;max-width:none!important;gap:8px!important}",
    "#ocSaveSlot #ocAutosaveText{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:34vw}",
    "#ocSaveSlot #ocVersionsBtn{min-height:36px!important;padding:4px 12px!important;font-size:15px!important;border-radius:999px!important}",
    "#ocUserMenuBtn{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 12px 4px 4px;border-radius:999px;" +
      "border:1px solid var(--border,#e5e7eb);background:var(--card,#fff);color:var(--text,#111);cursor:pointer;font:inherit;font-size:16px}",
    "#ocUserMenuBtn .avatar{margin:0}",
    "#ocUserMenuBtn .oc-caret{font-size:12px;opacity:.7}",
    "#userBox{position:relative;display:flex;align-items:center}",
    "#userBox[hidden]{display:none!important}",
    "#ocUserMenu{position:absolute;right:0;top:calc(100% + 8px);z-index:9700;min-width:280px;padding:10px;border-radius:14px;" +
      "background:var(--card,#fff);color:var(--text,#111);border:1px solid var(--border,#e5e7eb);box-shadow:0 12px 32px rgba(0,0,0,.16);" +
      "display:flex;flex-direction:column;gap:6px}",
    "#ocUserMenu[hidden]{display:none!important}",
    "#ocUserMenu .oc-menu-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#6b7280);padding:6px 8px 2px}",
    "#ocUserMenu .oc-menu-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 8px}",
    "#ocUserMenu .oc-menu-item{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px 12px;border-radius:10px;" +
      "border:0;background:transparent;color:var(--text,#111);font:inherit;font-size:16px;text-align:left;cursor:pointer}",
    "#ocUserMenu .oc-menu-item:hover,#ocUserMenu .oc-menu-item:focus-visible{background:var(--card-hover,#f5f7fa)}",
    "#ocUserMenu hr{border:0;border-top:1px solid var(--border,#e5e7eb);margin:4px 0}",
    "#ocUserMenu #hardRefreshBtn,#ocUserMenu #logoutBtn{all:unset}",
    "@media (max-width:700px){#ocSaveSlot #ocAutosaveText{max-width:22vw}#ocUserMenuBtn .user-name{display:none}}",
  ].join("\n");
  var st = document.createElement("style");
  st.id = "ocHeaderStyles"; st.textContent = css;
  document.head.appendChild(st);

  function el(tag, props, kids) {
    var e = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { if (k === "text") e.textContent = props[k]; else e.setAttribute(k, props[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }

  // ---- save status slot (filled by deal-draft.js) — connection dot moves next to it
  var slot = el("div", { id: "ocSaveSlot" });
  var conn = document.getElementById("connStatus");
  if (conn) slot.appendChild(conn);
  controls.insertBefore(slot, userBox);

  // ---- user menu: avatar + name become the button; the other controls move into the panel
  var avatar = document.getElementById("userAvatar");
  var name = document.getElementById("userName");
  var logout = document.getElementById("logoutBtn");
  var refresh = document.getElementById("hardRefreshBtn");
  var themeGroup = controls.querySelector(".ctl-group");
  var viewSeg = controls.querySelector(".ui-view-seg");

  var btn = el("button", { type: "button", id: "ocUserMenuBtn", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": "ocUserMenu", title: "Einstellungen und Abmelden" });
  if (avatar) btn.appendChild(avatar);
  if (name) btn.appendChild(name);
  btn.appendChild(el("span", { class: "oc-caret", "aria-hidden": "true", text: "▾" }));

  var menu = el("div", { id: "ocUserMenu", role: "menu", hidden: "" });
  menu.appendChild(el("div", { class: "oc-menu-title", text: "Darstellung" }));
  if (themeGroup) menu.appendChild(el("div", { class: "oc-menu-row" }, [themeGroup]));
  if (viewSeg) menu.appendChild(el("div", { class: "oc-menu-row" }, [el("span", { text: "Ansicht" }), viewSeg]));
  // autosave on/off (deal-draft.js) — remembered on this device
  if (window.__ocDealDraft && window.__ocDealDraft.setAutosave) {
    var auto = el("input", { type: "checkbox", id: "ocAutosaveToggle", style: "width:22px;height:22px" });
    auto.checked = window.__ocDealDraft.isAutosave();
    auto.addEventListener("change", function () { window.__ocDealDraft.setAutosave(auto.checked); });
    menu.appendChild(el("div", { class: "oc-menu-title", text: "Speichern" }));
    menu.appendChild(el("label", { class: "oc-menu-row", for: "ocAutosaveToggle", style: "cursor:pointer;min-height:44px" }, [auto,
      el("span", { text: "Automatisch speichern" })]));
    menu.appendChild(el("div", { class: "oc-menu-row", style: "font-size:14px;color:var(--muted,#6b7280);padding-top:0" }, [
      el("span", { text: "Aus: unten erscheint „Speichern“ – jede Speicherung wird eine neue Version desselben Entwurfs." })]));
  }
  menu.appendChild(el("hr", {}));
  function item(original, icon, label) {
    if (!original) return null;
    var wrap = el("div", { class: "oc-menu-item", role: "menuitem", tabindex: "0" }, [el("span", { "aria-hidden": "true", text: icon }), el("span", { text: label })]);
    original.textContent = ""; original.removeAttribute("title");
    original.setAttribute("aria-hidden", "true"); original.tabIndex = -1;
    wrap.appendChild(original); // the original button keeps its listeners; the row forwards clicks to it
    var fire = function () { original.click(); };
    wrap.addEventListener("click", function (e) { if (e.target !== original) fire(); });
    wrap.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fire(); } });
    return wrap;
  }
  var r = item(refresh, "⟳", "App neu laden"); if (r) menu.appendChild(r);
  var o = item(logout, "⏻", "Abmelden"); if (o) menu.appendChild(o);

  userBox.textContent = "";
  userBox.appendChild(btn);
  userBox.appendChild(menu);

  function setOpen(open) {
    menu.hidden = !open;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  }
  btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(menu.hidden); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !userBox.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setOpen(false); btn.focus(); } });
  // a theme/view change keeps the menu open (people try options); everything else closes it
  menu.addEventListener("click", function (e) { if (!e.target.closest(".oc-menu-row")) setOpen(false); });
})();
