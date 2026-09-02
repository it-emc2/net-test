import Foundation
import WebKit

/// Keeps the logged-in session across anything that clears the web view's data.
///
/// The plan originally called for a Bearer token held natively and injected
/// into every request. That would mean teaching the whole web app to attach a
/// header it currently does not send — it authenticates with the `net_session`
/// cookie and `credentials: "include"`. So instead of changing how auth works,
/// this just makes the existing cookie durable: copy it into the Keychain when
/// it appears, put it back when the cookie store has lost it.
///
/// The web app is untouched and the server sees exactly what it saw before.
enum SessionKeychain {
    private static let service = "de.emc2.konfigurator.session"
    private static let account = "net_session"

    // MARK: - Keychain

    private static func write(_ value: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var item = query
        item[kSecValueData as String] = Data(value.utf8)
        // Readable after the first unlock so a background sync can use it,
        // but never synced to iCloud or another device.
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let status = SecItemAdd(item as CFDictionary, nil)
        if status != errSecSuccess {
            // -34018 is errSecMissingEntitlement: the build is not signed, so
            // it has no application-identifier and the Keychain refuses it.
            // Expected for `CODE_SIGNING_ALLOWED=NO` simulator builds; on a
            // signed build the provisioning profile supplies it. Everything
            // else still works, the session just is not durable.
            NSLog("[session] keychain write refused (OSStatus %d) — session will not survive a data-store clear", Int(status))
        }
    }

    private static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ] as CFDictionary)
    }

    // MARK: - Cookie bridge

    /// Copy the session cookie out of the web view after a navigation. Cheap,
    /// and the value changes whenever the server slides the session forward.
    static func capture(from webView: WKWebView) {
        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
            guard let session = cookies.first(where: { $0.name == account }) else { return }
            write(session.value)
        }
    }

    /// Put the cookie back if the store no longer has one. Runs before the
    /// first load, so the app opens signed in rather than on a login page it
    /// may have no connection to reach.
    static func restoreIfMissing(into webView: WKWebView, host: String, secure: Bool,
                                 completion: @escaping () -> Void) {
        let store = webView.configuration.websiteDataStore.httpCookieStore
        store.getAllCookies { cookies in
            if cookies.contains(where: { $0.name == account }) {
                completion()
                return
            }
            guard let value = read(), let cookie = makeCookie(value, host: host, secure: secure) else {
                completion()
                return
            }
            store.setCookie(cookie) { completion() }
        }
    }

    private static func makeCookie(_ value: String, host: String, secure: Bool) -> HTTPCookie? {
        var props: [HTTPCookiePropertyKey: Any] = [
            .name: account,
            .value: value,
            .domain: host,
            .path: "/",
            // The server decides the real lifetime; this only has to outlive
            // the app launch that restores it.
            .expires: Date().addingTimeInterval(7 * 24 * 60 * 60),
        ]
        if secure { props[.secure] = "TRUE" }
        return HTTPCookie(properties: props)
    }
}
