## Summary

Adds `strictLoopback` config field to Debug UI security and implements full enforcement. When enabled, Control UI requests must originate from loopback addresses (127.0.0.1 or ::1).

## Problem

The original PR #6590 added a `strictLoopback` config field for hardening Control UI defaults, but:
1. The config field had no enforcement logic - users could enable it but it had no effect
2. The PR body incorrectly described unrelated plugin warning changes
3. No tests existed for the new option

Greptile flagged this: _"The new config field has no implementation - it's defined but never checked or enforced anywhere"_

## Solution

**Part 1 (8f43279) - Config field definition:**
- Added `strictLoopback` to `GatewayControlUiConfig` type and Zod schema
- Defaults to `false` for backward compatibility

**Part 2 (this commit) - Full enforcement:**

**In `src/gateway/control-ui.ts`:**
- New `isClientAllowedByLoopbackPolicy()` helper
- Resolves client IP from socket or headers (x-forwarded-for, x-real-ip)
- Respects trusted proxy configuration
- Returns 403 Forbidden for non-loopback when strictLoopback=true
- Applied to both HTTP and avatar handlers

**In `src/gateway/server-http.ts`:**
- Pass `strictLoopback` and `trustedProxies` config to handlers

**In `src/gateway/control-ui.http.test.ts`:**
- Comprehensive test suite: IPv4/IPv6 loopback, non-loopback blocking, trusted proxies

## Changes

### Part 1: Config Schema
- `src/config/types.gateway.ts`: Added `strictLoopback` field
- `src/config/zod-schema.ts`: Added schema validation

### Part 2: Enforcement 
- `src/gateway/control-ui.ts`: Loopback policy enforcement
- `src/gateway/server-http.ts`: Config passing
- `src/gateway/control-ui.http.test.ts`: Test coverage

## Security Model

| strictLoopback | Client IP | Result |
|----------------|-----------|--------|
| true | 127.0.0.1 / ::1 | ✅ Allow |
| true | 192.168.x.x / any | ❌ Block (403) |
| false | any | ✅ Allow |

## Testing Strategy

- ✅ IPv4 loopback allowed when enabled
- ✅ IPv6 loopback allowed when enabled  
- ✅ Non-loopback blocked (403) when enabled
- ✅ All IPs allowed when disabled
- ✅ Trusted proxy headers respected

## Validation

- [x] TypeScript compilation passes
- [x] Tests cover pass/fail cases
- [x] Backward compatible (defaults to false)

## Related

Closes #6590
Related: PR #18845

---

🤖 AI-assisted via Claude/OpenClaw. Full enforcement implementation per Greptile review feedback.
