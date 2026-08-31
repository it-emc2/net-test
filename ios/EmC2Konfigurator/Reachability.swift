import Network

/// Tells the web layer when the network genuinely comes back.
///
/// `navigator.onLine` reports whether an interface exists, not whether anything
/// is reachable through it — it stays `true` on a captive portal, on a Wi-Fi
/// network with no uplink, and on a van's hotspot that has dropped its data
/// connection. All three are ordinary on the road, and each one leaves the
/// offline save queue sitting on work it believes it has no reason to flush.
///
/// `NWPathMonitor` is the OS's own answer, so we use that and tell the page.
final class Reachability {
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "de.emc2.reachability")
    private var wasSatisfied: Bool?

    /// Called on the main queue when the path becomes satisfied *after* having
    /// been unsatisfied. Only the transition matters: the page already flushes
    /// on load, so re-announcing a connection it never lost would just make it
    /// re-fetch for nothing.
    var onReconnect: (() -> Void)?

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let satisfied = path.status == .satisfied
            defer { self.wasSatisfied = satisfied }

            // First callback describes the state at launch, not a change.
            guard let previous = self.wasSatisfied else { return }
            guard satisfied, !previous else { return }

            DispatchQueue.main.async { self.onReconnect?() }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }
}
