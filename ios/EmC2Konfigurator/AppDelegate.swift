import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    /// Set by the scene so the background task has something to talk to.
    /// Weak: if the scene is gone there is nothing to sweep, and holding it
    /// alive for a task iOS may never run would be its own leak.
    weak static var webViewController: WebViewController?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Registration has to happen before launch finishes or iOS raises.
        BackgroundSync.register { task in
            BackgroundSync.run(task, in: AppDelegate.webViewController?.webView)
        }
        return true
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
