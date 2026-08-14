import Foundation
import WebKit

/// Keeps a copy of the offline save queue outside the web view's data store.
///
/// Everything IndexedDB holds is evictable, and WebKit does not implement
/// persistent storage — `navigator.storage.persisted()` returns **false** on
/// the iPad, measured on the device (Phase 0 / R2). A save that is queued but
/// not yet synced can therefore be reclaimed under storage pressure, which is
/// exactly the one thing the queue exists to prevent.
///
/// So the page posts the queue here on every change and it is written to the
/// app container. On the next launch the file is injected back into the page,
/// which puts anything missing back.
///
/// Scope is deliberately one file and one direction:
///
/// - **Only the save queue.** It carries the full payload of every unsynced
///   draft and offer, so restoring it restores the work. `nt-local-docs` is
///   rebuilt from those same records on the JS side, and the planning and
///   pricing caches are re-fetchable — losing those costs a round trip, not a
///   day's work.
/// - **The page decides what to keep.** This class never merges or resolves
///   anything; it stores bytes and hands them back.
/// - **Not a backup.** It lives in the app container and goes when the app is
///   deleted. It survives eviction, nothing more.
final class DurabilityMirror: NSObject, WKScriptMessageHandler {
    static let messageName = "durability"

    private let fileURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("offline-queue-mirror.json")
    }()

    /// The user script that hands the last mirrored queue to the page before it
    /// loads. A `WKUserScript` is not subject to the page's CSP, which matters
    /// here: the app pins script-src to 'self' plus hashes.
    func injectionScript() -> WKUserScript {
        let raw = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? "[]"
        // Guard against a truncated write from a previous run: a syntax error
        // in an injected script would take the whole page down with it.
        let parsed = try? JSONSerialization.jsonObject(with: Data(raw.utf8))
        let safe = parsed is [Any] ? raw : "[]"

        return WKUserScript(
            source: "window.__nativeQueueMirror = \(safe);",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ controller: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              body["type"] as? String == "queue",
              let records = body["records"] as? [Any] else { return }

        // An empty queue writes an empty array rather than deleting the file:
        // "everything synced" and "never mirrored" then look the same on the
        // next launch, which is what we want.
        guard let data = try? JSONSerialization.data(withJSONObject: records) else { return }
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            NSLog("[durability] mirror write failed: %@", String(describing: error))
        }
    }
}
