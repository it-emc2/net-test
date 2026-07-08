/* Login page. Posts to /api/auth/login; the server sets an httpOnly session
   cookie. On success we go to the configurator (or ?next= target). */
(function () {
  "use strict";
  var form = document.getElementById("form");
  var err = document.getElementById("err");
  var btn = document.getElementById("btn");

  function nextUrl() {
    try {
      var n = new URLSearchParams(window.location.search).get("next");
      if (n && n.charAt(0) === "/" && n.charAt(1) !== "/") return n;
    } catch (e) { /* ignore */ }
    return "/";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.classList.remove("show");
    btn.disabled = true;
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: document.getElementById("email").value,
        password: document.getElementById("password").value,
      }),
    })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Login fehlgeschlagen"); return j; }); })
      .then(function () { window.location.href = nextUrl(); })
      .catch(function (e2) { err.textContent = e2.message; err.classList.add("show"); btn.disabled = false; });
  });
})();
