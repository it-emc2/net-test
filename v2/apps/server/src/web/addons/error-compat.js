/* v2 compatibility shim (ADR 015 + 021) — loaded FIRST in every page v2 serves.
 * v2 answers errors as { error: { code, message, requestId } }; today's screens read
 * `data.error` as text (e.g. `throw new Error(data.error || …)`), which would show
 * "[object Object]". This turns the object back into the message text and keeps the code and
 * request id next to it (errorCode, requestId) for support. Nothing else changes. */
(function () {
  "use strict";
  if (!window.Response || Response.prototype.__ocErrorCompat) return;
  var json = Response.prototype.json;
  Response.prototype.json = function () {
    return json.call(this).then(function (body) {
      if (body && typeof body === "object" && body.error && typeof body.error === "object" && typeof body.error.message === "string") {
        var e = body.error;
        body.error = e.message;
        if (e.code && body.errorCode === undefined) body.errorCode = e.code;
        if (e.requestId && body.requestId === undefined) body.requestId = e.requestId;
      }
      return body;
    });
  };
  Response.prototype.__ocErrorCompat = true;
})();
