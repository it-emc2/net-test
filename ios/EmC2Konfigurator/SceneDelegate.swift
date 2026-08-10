import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var root: WebViewController? {
        window?.rootViewController as? WebViewController
    }

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
    }

    /// The field failure this guards against: a technician switches to
    /// MagicPlan, iOS discards the app, and the survey is gone. Flushing here
    /// puts the work in progress on disk before that can happen.
    func sceneDidEnterBackground(_ scene: UIScene) {
        root?.flushWorkInProgress()
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        root?.reloadIfShowingOfflineFallback()
    }
}
