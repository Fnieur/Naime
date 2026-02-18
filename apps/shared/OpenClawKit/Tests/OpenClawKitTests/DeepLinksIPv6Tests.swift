import Foundation
import OpenClawKit
import Testing

@Suite struct DeepLinksIPv6Tests {
    @Test func setupCodeFromIPv6PreservesConnectableWebsocketURL() {
        let payload = #"{"url":"wss://[fd7a:115c:a1e0::1]:443","token":"tok"}"#
        let encoded = Self.base64UrlEncode(payload)

        let link = GatewayConnectDeepLink.fromSetupCode(encoded)

        #expect(link?.host == "fd7a:115c:a1e0::1")
        #expect(link?.port == 443)
        #expect(link?.tls == true)
        #expect(link?.websocketURL?.absoluteString == "wss://[fd7a:115c:a1e0::1]:443")
    }

    @Test func websocketURLSupportsBracketedIPv6HostInput() {
        let link = GatewayConnectDeepLink(
            host: "[fd7a:115c:a1e0::1]",
            port: 18789,
            tls: false,
            token: nil,
            password: nil
        )

        #expect(link.websocketURL?.absoluteString == "ws://[fd7a:115c:a1e0::1]:18789")
    }

    private static func base64UrlEncode(_ input: String) -> String {
        Data(input.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
