import BackgroundTasks
import UIKit
import WebKit

/// Flushes the offline save queue while the app is in the background.
///
/// The gap this closes is narrow but real: a salesperson saves offline, pockets
/// the iPad, and walks back into signal without ever reopening the app. The
/// page flushes on load and on `online`, but a backgrounded WKWebView has its
/// JavaScript suspended, so neither fires. The work then sits on the device
/// until they next open it — which might be the following morning.
///
/// **iOS decides whether this ever runs.** It is opportunistic, throttled by
/// how the app is actually used, and never guaranteed. So this is a way for
/// data to arrive *sooner*, never the thing that makes it arrive at all: the
/// foreground flush remains the guarantee. Nothing here is allowed to be the
/// only path for a save.
enum BackgroundSync {
    static let identifier = "de.emc2.konfigurator.sync"

    /// Must be called before the app finishes launching, or iOS raises.
    static func register(handler: @escaping (BGTask) -> Void) {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: identifier,
            using: nil
        ) { task in
            handler(task)
        }
    }

    static func schedule() {
        let request = BGAppRefreshTaskRequest(identifier: identifier)
        // A floor, not a promise — iOS will pick its own moment, usually later.
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Simulators refuse to schedule, and a device can be over its
            // budget. Neither is worth bothering anyone about.
            NSLog("[bg-sync] not scheduled: %@", String(describing: error))
        }
    }

    /// Wake the page just long enough for its own `online` handler to run the
    /// queue sweep, then get out of the way. Re-schedules first so a single
    /// failure does not end the chain.
    static func run(_ task: BGTask, in webView: WKWebView?) {
        schedule()

        guard let webView else {
            task.setTaskCompleted(success: false)
            return
        }

        var finished = false
        let finish = { (ok: Bool) in
            guard !finished else { return }
            finished = true
            task.setTaskCompleted(success: ok)
        }

        // iOS reclaims the time slice without warning; leaving the task
        // un-completed would count against future scheduling.
        task.expirationHandler = { finish(false) }

        webView.evaluateJavaScript("window.dispatchEvent(new Event('online'))") { _, _ in
            // The sweep is asynchronous inside the page. There is no callback
            // to wait on without a bridge, so give it a moment and let the
            // next foreground launch pick up anything that did not make it.
            DispatchQueue.main.asyncAfter(deadline: .now() + 8) { finish(true) }
        }
    }
}
