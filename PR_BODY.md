## Summary

Implements full strictLoopback enforcement for the Control UI, ensuring that when enabled, all Control UI requests must originate from loopback addresses (127.0.0.1 or ::1). This hardens the gateway configuration security model.

## Problem

The `strictLoopback` config field was added to the schema but the actual enforcement logic was missing. Users could enable this security feature but it had no effect. The Control UI would accept requests from non-loopback addresses even with strictLoopback=true.

## Solution

Added comprehensive enforcement logic:

**In `src/gateway/control-ui.ts`:**
- New helper function `isClientAllowedByLoopbackPolicy()` that checks if a request should be blocked based on strictLoopback setting
- Resolves client IP from socket remoteAddress or headers (x-forwarded-for, x-real-ip)
- Respects trusted proxy configuration for accurate client IP detection
- Applied enforcement to both HTTP request handler and avatar request handler
- Returns 403 Forbidden with descriptive message when client IP is not loopback

**In `src/gateway/server-http.ts`:**
- Pass trustedProxies configuration to control-ui request handlers

## Changes

### Code Changes
- **`src/gateway/control-ui.ts`**: Added loopback policy enforcement
  - New `isClientAllowedByLoopbackPolicy()` function
  - Updated `handleControlUiAvatarRequest()` to check strictLoopback
  - Updated `handleControlUiHttpRequest()` to check strictLoopback early
  - Both handlers now reject non-loopback IPs with 403 Forbidden

- **`src/gateway/server-http.ts`**: Pass configuration to handlers
  - Extract trustedProxies from config
  - Pass to both avatar and HTTP request handlers

### Test Changes
- **`src/gateway/control-ui.http.test.ts`**: New test suite for strictLoopback enforcement
  - ✅ Allow loopback requests (127.0.0.1) when enabled
  - ✅ Block non-loopback requests when enabled
  - ✅ Allow non-loopback when disabled
  - ✅ Support IPv6 loopback (::1)
  - ✅ Respect x-forwarded-for with trusted proxies

## Security Model

### strictLoopback=true (Recommended for local-only deployments)
- Only 127.0.0.1 and ::1 can access Control UI
- Useful for workstations, development machines, or air-gapped systems
- Blocks remote access entirely (even over VPN/SSH tunnel endpoints)

### strictLoopback=false (Default - current behavior)
- Control UI accessible per existing auth rules
- Respects trusted proxy headers when configured
- Suitable for cloud deployments with reverse proxies

## Testing Strategy

| Scenario | strictLoopback | Client IP | Expected |
|----------|---|---|---|
| Direct loopback access | true | 127.0.0.1 | ✅ Allow |
| Direct non-loopback | true | 192.168.1.1 | ❌ Block (403) |
| IPv6 loopback | true | ::1 | ✅ Allow |
| IPv6 non-loopback | true | 2001:db8::1 | ❌ Block (403) |
| Trusted proxy → loopback client | true | forwarded: 127.0.0.1 | ✅ Allow |
| Trusted proxy → non-loopback client | true | forwarded: 8.8.8.8 | ❌ Block (403) |
| Feature disabled | false | any IP | ✅ Allow |

## Validation

- [x] TypeScript compilation passes
- [x] Client IP resolution logic reuses `resolveGatewayClientIp()` from `net.ts`
- [x] Loopback detection uses existing `isLoopbackAddress()` helper
- [x] Test coverage covers: IPv4 loopback, IPv6 loopback, non-loopback, trusted proxies, feature disabled
- [x] Error messages are descriptive (403 + "Forbidden: Access restricted to loopback addresses only")

## Related

Closes #6590 (Part 2 of strictLoopback implementation)

---

## 🤖 AI Assistance Disclosure

This PR is **AI-assisted** using Claude via OpenClaw.

- **Implementation approach**: Full enforcement logic added per Greptile feedback; reuses existing IP resolution and loopback detection utilities
- **Testing coverage**: Comprehensive test suite covering all strictLoopback scenarios (IPv4/IPv6, trusted proxies, disabled state)
- **I understand what the code does**: 
  - Early-exit rejection of non-loopback clients when policy is enabled
  - Proper IP resolution from socket + headers with proxy support
  - Backward compatible (disabled by default)
  - Security-forward (can be hardened per deployment needs)

## Migration Guide

Users who want to harden their Control UI deployment:

```yaml
gateway:
  controlUi:
    strictLoopback: true  # Enable loopback-only access
```

This is a breaking change only for deployments that were relying on remote Control UI access without additional reverse proxy auth. All existing deployments with strictLoopback unset or false remain unchanged.
