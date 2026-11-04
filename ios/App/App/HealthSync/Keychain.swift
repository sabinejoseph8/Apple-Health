import Foundation
import Security

// The upload token (R8, R10) lives in the phone's keychain, never in a file
// or in UserDefaults. It is readable after the phone's first unlock since
// boot, so the background sync can use it while the phone is locked. The
// keychain outlives the app, so each token is kept under the account it
// belongs to: another account signing in on the same phone never finds it.
enum Keychain {
    private static let service = "com.clarivi.app.upload-token"

    private static func query(_ userId: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: userId]
    }

    static func token(for userId: String) -> String? {
        var q = query(userId)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func setToken(_ token: String, for userId: String) -> Bool {
        clearToken(for: userId)
        var q = query(userId)
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func clearToken(for userId: String) {
        SecItemDelete(query(userId) as CFDictionary)
    }
}
