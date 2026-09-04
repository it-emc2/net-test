# Installing the Konfigurator app on an iPhone or iPad

A start-to-finish guide for putting the native app on a device with a **free
Apple ID** — no paid Apple Developer account, no Mosyle, no App Store.

Written after doing it for real on an iPhone XR, including the two things that
go wrong on the way.

---

## First, the question that matters most

### If I change the web app, do I have to rebuild the iOS app?

**No.** Almost never.

The iOS app is a thin shell around a web view. It loads `https://oc.emc2.de`
at runtime — it does not contain a copy of the configurator. Add a field,
change a price rule, add a whole new tab: deploy the web app as usual and the
device picks it up the next time the app is opened with a connection.

No Xcode, no reinstall, no re-signing, nothing on the device.

**The only reasons to rebuild the app:**

| Change | Rebuild? |
|---|---|
| New form field, new tab, pricing change, template change, anything in `src/` | **No** — just deploy |
| The server address (`EMC2BaseURL`) or the allowed hosts (`WKAppBoundDomains`) | Yes |
| Native behaviour: file downloads, reachability, Keychain session, background sync, the durability mirror | Yes |
| App icon or app name | Yes |
| Nothing at all — the weekly signature expiry | Not a code change, but you do need Xcode. See [Every 7 days](#every-7-days) |

**How an update actually reaches the device.** The service worker is versioned
by the server's build id, so a deploy changes its URL, the device sees a new
worker, installs it and drops the old cache. In practice: **deploy, then open
the app once with a connection.** If the device is offline it keeps running the
last cached version — deliberately, so a technician on site is never left
without an app.

---

## What you need

- A Mac with **Xcode** installed.
- Any **Apple ID**. A free one is fine; it appears in Xcode as a "Personal
  Team".
- The device, a **USB cable**, and the device's passcode.
- A working login for `https://oc.emc2.de`.
- The device on **iOS 16 or newer**.

### The one real catch

A free Apple ID signs the app for **7 days**. After that the app refuses to
launch until you repeat the build (see [Every 7 days](#every-7-days)).

**Your data is not lost when this happens.** Re-running from Xcode is an
upgrade install: the offline queue, unsynced drafts, the durability mirror and
the login all survive. It is the app's *availability* that expires, not the
work. But it does mean the device needs to see the Mac about once a week.

---

## Step by step

### 1. Sign in to Xcode

**Xcode → Settings → Accounts → `+` → Apple ID**, and sign in.

It will show up as *Your Name (Personal Team)*.

### 2. Open the project

The project lives in a git worktree, not in the main checkout, so **use the
full path** — `open ios/...` from your home folder will just say the file does
not exist:

```bash
open /Users/digital_neu/Documents/GitHub/net-test/.claude/worktrees/v3-to-main-branch-strategy-b739cc/ios/EmC2Konfigurator.xcodeproj
```

> If the worktree has been removed, get the branch into the normal checkout
> instead:
> ```bash
> cd /Users/digital_neu/Documents/GitHub/net-test
> git fetch origin && git switch claude/ipad-configurator-local-first-d25766
> open ios/EmC2Konfigurator.xcodeproj
> ```

### 3. Connect the device *before* touching the signing settings

Plug it in with the cable. On the device, unlock it and tap **Trust This
Computer**, then enter the passcode.

Then in Xcode, at the **top of the window** next to the scheme name, click the
run-destination selector and choose the device.

Xcode will say *"Preparing …"* while it mounts its developer support files.
First connection only; it can take a few minutes. Let it finish.

> **Do this before step 4.** A free team can only create a provisioning
> profile once it has a registered device, and Xcode registers the device when
> you select it. Skipping ahead produces the confusing error in
> [Troubleshooting](#troubleshooting).

### 4. Set the signing team

Select the **EmC2Konfigurator** target → **Signing & Capabilities** tab:

- **Automatically manage signing**: ticked
- **Team**: your Personal Team

Within a few seconds it should show **Provisioning Profile: Xcode Managed
Profile** and **Signing Certificate: Apple Development: your@email**, with no
warnings. If a warning is still showing, click **Try Again**.

If Xcode says the bundle identifier is unavailable, change **Bundle
Identifier** to something unique — `de.emc2.konfigurator.rm` or similar.
Nothing else in the project depends on it.

Ignore any *"Update to recommended settings"* prompt. It is cosmetic.

### 5. Run

Press **⌘R** (or the ▶ button).

The build will succeed and install, and then **the launch will fail** with
*"Untrusted Developer"*. That is expected on a first install.

### 6. Trust the certificate on the device

On the device: **Settings → General → VPN & Device Management →** tap your
Apple ID **→ Trust**.

Then open the app from the home screen — the blue **OC** icon, named
**Angebote**. Or press ⌘R again in Xcode.

### 7. Install over WiFi from now on

So you do not need the cable next week:

**Xcode → Window → Devices and Simulators →** select the device **→** tick
**Connect via network**.

---

## First-run checks

Do these in order. The first two are quick; the last one is the one that
actually matters.

### 1. It loads and you can log in

You should get the emc² login page. Log in.

A **blank white screen** means the server host is not in the app's allowed
list — see [Troubleshooting](#troubleshooting).

### 2. The login survives a restart

Force-quit the app (swipe up from the bottom, then swipe the app card away)
and reopen it. It should come back **already logged in**.

This is the Keychain backup doing its job. It could not be verified on the
simulator — unsigned builds are refused Keychain access — so this is its first
real test.

### 3. An offer PDF opens

Build an offer far enough to export a PDF. It should appear in the normal iOS
share sheet, where you can save it to Files or mail it.

### 4. The connection status dot

Look at the header. Turn on **Airplane Mode**: the dot should go from green to
**red within a few seconds** — this is `NWPathMonitor` catching a real
disconnect (PR #191), not `navigator.onLine`, which would stay green all
session. Turn Airplane Mode back off: it should return to green once the app
reaches the server again. This exact path (`onDisconnect` while already
running) was unverified on a real device as of PR #191 — if it does not flip
red, that is the thing to report.

### 5. The offline test — the important one

This is the whole reason the app exists. Do it once properly.

1. Turn on **Airplane Mode**.
2. Open the app. The planning list should still be there, marked
   **"Offline – Stand …"** with the time it was last fetched.
3. Tap a planned appointment and start an offer. The customer's details,
   **including the Anrede**, should fill in.
4. Fill in a surname and tap **⚡ Schnellspeichern**.
5. The save bar should show **"1 ausstehend – wird synchronisiert"**.
6. **Force-quit the app and reopen it**, still in Airplane Mode. The app should
   still open and work, and the draft should still be listed — marked
   **"nur lokal"**.
7. Turn **Airplane Mode off**. Within a few seconds the pending badge should
   clear and the draft should appear in the normal drafts search.

If all seven steps pass, the device is ready for a real day.

---

## Every 7 days

The free signature expires. The app will refuse to launch, usually with a
message about the developer being unavailable.

**The fix takes two minutes:**

1. Bring the device near the Mac (or connect the cable if WiFi installing is
   not set up).
2. Open the project, select the device as the run destination.
3. **⌘R**.

That is all — no re-trusting, no re-login, and nothing on the device is lost.

**Put a recurring reminder in the calendar**, ideally the morning of a day the
device is at the office anyway. If it expires while someone is out on the
road, they cannot work around it from there.

> If this becomes annoying, an **Apple Developer Program** membership (~€99 a
> year) removes it: profiles last a year and the app can be distributed
> through Mosyle. See `ios/README.md`.

---

## Troubleshooting

| What you see | What it means |
|---|---|
| `The file /Users/you/ios/… does not exist` | You ran `open ios/…` from the wrong folder. Use the full path in [step 2](#2-open-the-project). |
| **"Communication with Apple failed — your team has no devices"** | The device was not connected and selected yet. Do [step 3](#3-connect-the-device-before-touching-the-signing-settings) first, then click **Try Again**. The developer.apple.com link in that message is for paid accounts; ignore it. |
| **"No profiles for 'de.emc2.konfigurator' were found"** | Same cause as above. It clears once a device is registered. |
| **"Untrusted Developer"** on the device | Normal on first install — [step 6](#6-trust-the-certificate-on-the-device). |
| **Blank white screen** in the app | The host in `EMC2BaseURL` is missing from `WKAppBoundDomains`. Both live in `ios/EmC2Konfigurator/Info.plist`, and every host the app opens must appear in both. |
| Login page even though you logged in yesterday | Expected only if the app was reinstalled from scratch, or the session is older than the server's window. Otherwise report it — the Keychain backup should prevent this. |
| Stuck on a "no connection" screen on a **first** launch | The service worker has to cache the app once **with** a connection before it can serve it offline. Open it once online. |
| App will not launch, worked last week | The 7-day signature expired. See [Every 7 days](#every-7-days). |
| Device shows as `connected (no DDI)` in Xcode | It is still preparing. Wait for it to finish. |

---

## The alternative: no Xcode at all

If the weekly re-signing is not workable, the configurator can also be added
straight to the home screen from Safari — open `https://oc.emc2.de`, then
**Share → Add to Home Screen**. Mosyle can push this as a Web Clip profile
(set **Full Screen: On**).

That gets you the offline planning cache, offline drafts and the save queue,
with no expiry and no Mac. What it does **not** get you is the Keychain login
backup, downloads via the share sheet, or the durability mirror that protects
queued work from being evicted.

**Do not run both at once.** The Web Clip and the app keep entirely separate
storage — a draft saved in one is invisible in the other, so work would end up
split across two silos with no way to move it. Pick one.
