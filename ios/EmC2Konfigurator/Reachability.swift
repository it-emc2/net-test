import Network

/// Tells the web layer when the network genuinely comes back — or goes away.
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

    /// The mirror of `onReconnect`, plus one asymmetry: a launch that is
    /// *already* offline fires this immediately rather than waiting for a
    /// transition that may never come this session. That asymmetry is safe
    /// here — unlike `onReconnect`, which triggers a real sync sweep that
    /// would be wasted work on a normal launch, this only corrects a status
    /// display, so announcing the true state from the first sample is strictly
    /// more correct and costs nothing.
    var onDisconnect: (() -> Void)?

    /// The latest known state, for a caller that needs the *current* answer
    /// rather than a transition — e.g. stamping a freshly loaded page with
    /// the right status before any further path update arrives. Defaults to
    /// reachable: optimistic until proven otherwise, matching how the page
    /// itself starts (`navigator.onLine` before this ever overrides it).
    var isReachable: Bool { wasSatisfied ?? true }

    func start() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            let satisfied = path.status == .satisfied
            let previous = self.wasSatisfied
            defer { self.wasSatisfied = satisfied }

            guard let previous else {
                // First callback: report an already-offline launch right away.
                // An already-online launch stays silent — nothing was lost, so
                // there is nothing to reconnect.
                if !satisfied {
                    DispatchQueue.main.async { self.onDisconnect?() }
                }
                return
            }

            if satisfied, !previous {
                DispatchQueue.main.async { self.onReconnect?() }
            } else if !satisfied, previous {
                DispatchQueue.main.async { self.onDisconnect?() }
            }
        }
        monitor.start(queue: queue)
    }

    func stop() {
        monitor.cancel()
    }
}
