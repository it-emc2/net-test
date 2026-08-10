import UIKit
import WebKit

/// The whole app: one full-screen WKWebView showing the existing configurator.
///
/// No business logic lives here and none should. Everything in this file is a
/// platform capability the web layer cannot reach on its own — see
/// docs/plan-ipad-local-first.md §17.
///
/// Two constraints come from the Phase 0 spike and are not negotiable:
///
///   1. `limitsNavigationsToAppBoundDomains` + `WKAppBoundDomains` in Info.plist
///      is what gives a WKWebView service workers at all. Without it the worker
///      silently never registers: no offline shell, no cached planning week.
///   2. That same setting blocks navigation to anything not in the list, so
///      every external link has to be handed to Safari (see decidePolicyFor).
final class WebViewController: UIViewController {

    /// Overridable from Info.plist so a build can point at staging or a local
    /// server without touching code. Any host used here must also appear in
    /// WKAppBoundDomains or navigation to it is refused.
    private var baseURL: URL {
        let configured = Bundle.main.object(forInfoDictionaryKey: "EMC2BaseURL") as? String
        return URL(string: configured ?? "") ?? URL(string: "https://oc.emc2.de")!
    }

    private(set) var webView: WKWebView!
    private var offlineView: UIView?
    private let reachability = Reachability()

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        setUpWebView()
        startWatchingTheNetwork()

        // Put a saved session back before the first load, so the app opens
        // signed in rather than on a login page it may not be able to reach.
        SessionKeychain.restoreIfMissing(
            into: webView,
            host: baseURL.host ?? "",
            secure: baseURL.scheme == "https",
        ) { [weak self] in
            self?.load()
        }
    }

    private func startWatchingTheNetwork() {
        reachability.onReconnect = { [weak self] in self?.networkCameBack() }
        reachability.start()
    }

    deinit { reachability.stop() }

    override var preferredStatusBarStyle: UIStatusBarStyle { .darkContent }

    private func setUpWebView() {
        let config = WKWebViewConfiguration()
        config.limitsNavigationsToAppBoundDomains = true   // see note 1 above
        config.websiteDataStore = .default()               // persistent, not ephemeral
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false // it is a wizard, not a site
        webView.scrollView.bounces = false                  // no rubber-banding on a form
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
        ])
    }

    func load() {
        hideOfflineView()
        webView.load(URLRequest(url: baseURL))
    }

    // MARK: - Lifecycle hooks

    /// iOS can discard a backgrounded app without warning, and `beforeunload`
    /// frequently never runs when it does. session-recovery.js flushes its
    /// snapshot on `pagehide`, so firing that as we background is the cheapest
    /// way to make sure the work in progress is on disk — no change to the web
    /// app required.
    func flushWorkInProgress() {
        webView.evaluateJavaScript("window.dispatchEvent(new Event('pagehide'))")
    }

    /// Back on signal: the page's own "online" listeners refresh the planning
    /// week and flush the offline save queue. This only matters when the shell
    /// was loaded from cache and never reached the network at all.
    func reloadIfShowingOfflineFallback() {
        guard offlineView != nil else { return }
        load()
    }

    /// NWPathMonitor saw the connection return.
    ///
    /// Dispatching the page's own `online` event rather than inventing a new
    /// hook is deliberate: OfflineSaveQueue and the planning panel both
    /// already listen for it, so this needs no bridge and no change to the web
    /// app. The queued drafts flush and the planning week refreshes exactly as
    /// they would in a browser — the only difference is that the trigger is
    /// now the OS's answer instead of `navigator.onLine`'s guess.
    func networkCameBack() {
        if offlineView != nil {
            load()   // never had a shell to begin with; start over
            return
        }
        webView.evaluateJavaScript("window.dispatchEvent(new Event('online'))")
    }

    // MARK: - Offline fallback

    /// Only shown when there is no cached shell to fall back on — i.e. the app
    /// was installed and first opened without a connection. Once the service
    /// worker has the shell, an offline launch renders the real app instead.
    private func showOfflineView() {
        guard offlineView == nil else { return }

        let container = UIView()
        container.backgroundColor = .systemBackground
        container.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Keine Verbindung"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textAlignment = .center

        let body = UILabel()
        body.text = """
            Der Konfigurator konnte noch nicht geladen werden. \
            Bitte einmal mit Internetverbindung öffnen — danach \
            funktioniert die App auch offline.
            """
        body.font = .preferredFont(forTextStyle: .body)
        body.textColor = .secondaryLabel
        body.numberOfLines = 0
        body.textAlignment = .center

        let retry = UIButton(type: .system)
        retry.setTitle("Erneut versuchen", for: .normal)
        retry.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retry.addAction(UIAction { [weak self] _ in self?.load() }, for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, body, retry])
        stack.axis = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(stack)
        view.addSubview(container)
        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: view.topAnchor),
            container.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 48),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -48),
        ])
        offlineView = container
    }

    private func hideOfflineView() {
        offlineView?.removeFromSuperview()
        offlineView = nil
    }
}

// MARK: - Navigation

extension WebViewController: WKNavigationDelegate {

    private func isInternal(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased(), let ourHost = baseURL.host?.lowercased() else {
            return false
        }
        return host == ourHost
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        // tel:, mailto: and friends are for the system, not the web view.
        if let scheme = url.scheme?.lowercased(),
           !["http", "https", "about", "blob", "data"].contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        // Anything off our own host must go to Safari. This is not a
        // preference: with app-bound domains on, the web view would refuse the
        // navigation anyway and the user would just see nothing happen. The
        // planning cards' Google/Apple Maps route links are the common case.
        if url.scheme?.hasPrefix("http") == true, !isInternal(url) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // A response the web view cannot display (the generated PDFs and DOCX)
        // becomes a download rather than a blank page.
        decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideOfflineView()
        // The value changes whenever the server slides the session forward, so
        // take a copy on every navigation rather than only after login.
        SessionKeychain.capture(from: webView)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        // A service worker serving the cached shell resolves normally, so
        // reaching here means there is genuinely nothing to show.
        let code = (error as NSError).code
        let offline = [NSURLErrorNotConnectedToInternet,
                       NSURLErrorCannotFindHost,
                       NSURLErrorCannotConnectToHost,
                       NSURLErrorNetworkConnectionLost,
                       NSURLErrorTimedOut].contains(code)
        if offline { showOfflineView() }
    }

    func webView(_ webView: WKWebView,
                 navigationAction: WKNavigationAction,
                 didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView,
                 navigationResponse: WKNavigationResponse,
                 didBecome download: WKDownload) {
        download.delegate = self
    }
}

// MARK: - New windows

extension WebViewController: WKUIDelegate {
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target="_blank" has no window to open into here. Internal links load
        // in place; external ones go to Safari.
        if let url = navigationAction.request.url {
            if isInternal(url) {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        // session-recovery.js and the drafts flow both use confirm(); without
        // this delegate the call returns false and the feature silently dies.
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Abbrechen", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}

// MARK: - Downloads

/// `URL.createObjectURL` + `<a download>` does nothing in a WKWebView on its
/// own — the offer PDF would simply never appear. The download is written to a
/// temporary file and handed to the share sheet so it can go to Files, Mail or
/// anywhere else the user picks.
extension WebViewController: WKDownloadDelegate {

    func download(_ download: WKDownload,
                  decideDestinationUsing response: URLResponse,
                  suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        let name = suggestedFilename.isEmpty ? "Angebot.pdf" : suggestedFilename
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let destination = dir.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: destination)  // a repeat export must not fail
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = download.progress.fileURL else { return }
        present(share: url)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let alert = UIAlertController(
            title: "Download fehlgeschlagen",
            message: error.localizedDescription,
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func present(share url: URL) {
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // iPad requires an anchor or this crashes.
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: view.bounds.midX, y: view.bounds.maxY - 40, width: 1, height: 1)
        present(sheet, animated: true)
    }
}
