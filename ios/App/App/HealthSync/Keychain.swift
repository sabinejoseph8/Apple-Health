import Foundation
import Security

// The upload token (R8, R10) lives in the phone's keychain, never in a file
// or in UserDefaults. It is readable after the phone's first unlock since
// boot, so the background sync can use it while the phone is locked.
enum Keychain {
    private static let service = "com.clarivi.app"
    private static let account = "upload-token"

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    static func token() -> String? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func setToken(_ token: String) -> Bool {
        clearToken()
        var q = query
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    static func clearToken() {
        SecItemDelete(query as CFDictionary)
    }
}
