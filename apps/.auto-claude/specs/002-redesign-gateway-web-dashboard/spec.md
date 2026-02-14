# Specification: Redesign Gateway Web Dashboard

## Overview

This task involves finding and redesigning the existing gateway web dashboard (full management interface) in `/Users/jkneen/Documents/GitHub/atomicbot` with improved usability. The redesign will implement a two-tier mode system (Basic for regular developers vs Advanced for power users/hackers) and establish consistent design styling using Vercel AI SDK UI and AI Elements UI libraries.

The current dashboard is built with Lit web components and provides management capabilities including: overview, sessions, agents, nodes, configuration, usage metrics, channel management, logs, and debug views. This redesign will modernize the UI while maintaining all existing functionality.

## Workflow Type

**Type**: feature

**Rationale**: This is a feature development task that involves:
1. Finding/locating the existing web dashboard implementation
2. Adding new functionality (Basic/Advanced mode toggle)
3. Integrating new UI libraries (Vercel AI SDK UI, AI Elements UI)
4. Redesigning existing UI components for consistency

## Task Scope

### Services Involved
- **atomicbot/ui** (primary) - The web-based control UI/dashboard
- **atomicbot/src/gateway** (integration) - Backend gateway that the UI connects to

### This Task Will:
- [ ] Locate and audit the existing gateway web dashboard implementation in `/Users/jkneen/Documents/GitHub/atomicbot/ui`
- [ ] Identify all existing UI views (overview, sessions, agents, nodes, config, usage, channels, logs, debug)
- [ ] Implement Basic mode (simplified view for regular developers)
- [ ] Implement Advanced mode (full functionality for power users/hackers)
- [ ] Adopt Vercel AI SDK design patterns for consistent styling (NOT React integration - see Technical Note)
- [ ] Adopt AI Elements UI patterns for chat-compatible components (reimplemented in Lit - see Technical Note)
- [ ] Create mode toggle mechanism that persists user preference
- [ ] Ensure consistent design system across all dashboard views
- [ ] Maintain backward compatibility with all existing gateway API endpoints

### Out of Scope:
- Changes to backend gateway logic
- Mobile app interfaces
- Creating new gateway functionality (UI only)
- Database migrations
- Authentication changes

## Service Context

### atomicbot/ui (Primary Service - Web Dashboard)

**Tech Stack:**
- Language: TypeScript
- Framework: Lit Web Components + Vite
- Key directories:
  - `src/ui/` - Main UI source
  - `src/ui/views/` - Dashboard views (overview, sessions, agents, etc.)
  - `src/ui/components/` - Reusable UI components
  - `src/ui/controllers/` - View controllers

**Entry Point:** `ui/index.html`

**How to Run:**
```bash
cd /Users/jkneen/Documents/GitHub/atomicbot/ui && npm run dev
```

**Port:** 3000 (development)

### atomicbot/src/gateway (Backend)

**Tech Stack:**
- Language: TypeScript/Node.js
- Framework: Custom gateway server
- Key directories:
  - `src/gateway/` - Gateway implementation
  - `src/gateway/server-methods/` - RPC methods exposed to UI

**How to Run:**
```bash
cd /Users/jkneen/Documents/GitHub/atomicbot && pnpm dev
```

**Port:** 3000 (HTTP), 3001 (WebSocket)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `ui/src/ui/app.ts` | ui | Add mode toggle state management |
| `ui/src/ui/gateway.ts` | ui | Update for new UI patterns |
| `ui/src/ui/app-gateway.ts` | ui | Add Basic/Advanced mode UI |
| `ui/src/ui/views/overview.ts` | ui | Redesign with consistent styling |
| `ui/src/ui/views/sessions.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/agents.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/nodes.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/config.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/usage.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/channels.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/logs.ts` | ui | Redesign for Basic/Advanced modes |
| `ui/src/ui/views/debug.ts` | ui | Move to Advanced mode only |
| `ui/src/ui/navigation.ts` | ui | Add mode-aware navigation |
| `ui/src/styles/` | ui | Add design system tokens (inspired by AI SDK patterns) |

## Files to Reference

These files show patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `ui/src/ui/app-render.ts` | Main rendering logic and state management |
| `ui/src/ui/navigation.ts` | View navigation and routing |
| `ui/src/ui/views/config-form.ts` | Form components and validation |
| `ui/src/ui/app-settings.ts` | Settings management patterns |
| `ui/src/ui/components/` | Existing component patterns |

## Patterns to Follow

### Web Components with Lit

From `ui/src/ui/app.ts`:

```typescript
import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('app-root')
export class AppRoot extends LitElement {
  @state() private _view = 'overview';

  static styles = css`
    :host {
      display: block;
      height: 100vh;
    }
  `;

  render() {
    return html`
      <div class="app-container">
        ${this.renderNavigation()}
        <main class="content">
          ${this.renderCurrentView()}
        </main>
      </div>
    `;
  }
}
```

**Key Points:**
- Use Lit decorators for custom elements
- State management with @state() decorator
- CSS-in-JS with css template tag
- Template literals with html tag for rendering

### View Controller Pattern

From `ui/src/ui/controllers/`:
- Each view has a dedicated controller
- Controllers handle state and business logic
- Views are pure rendering functions
- Controllers communicate with gateway via RPC

### Navigation Pattern

From `ui/src/ui/navigation.ts`:
- Hash-based routing (#overview, #sessions, etc.)
- Sidebar navigation with icons
- Active state indication

## Technical Note: React Libraries in Lit Project

**CRITICAL ARCHITECTURAL CONSTRAINT**: The existing dashboard uses **Lit Web Components**, but Vercel AI SDK UI (`@ai-sdk/react`) and AI Elements are **React-only libraries**.

### Why This Matters
- AI Elements **requires**: Next.js project + shadcn/ui + Tailwind CSS
- Current project uses: Lit Web Components + Vite
- These are fundamentally incompatible architectures

### Solution: Pattern Adoption, Not Library Integration
Instead of importing React components, we will:
1. **Extract design tokens** from AI SDK/AI Elements documentation
2. **Reimplement patterns** in Lit using existing CSS-in-JS approach
3. **Use the core `ai` package** for any server-side AI functionality (not the React hooks)

### What This Means for Implementation
- Do NOT install `@ai-sdk/react` - it requires React
- Do NOT run `npx ai-elements` - it requires Next.js + shadcn/ui
- Instead: Study the AI SDK/AI Elements design patterns and apply them manually in Lit

### Reference Commands (for research only)
```bash
# These will NOT work in the current Lit project:
# npm install @ai-sdk/react  # WRONG - requires React
# npx ai-elements@latest     # WRONG - requires Next.js
```

## Requirements

### Functional Requirements

1. **Basic Mode - Simplified View**
   - Description: Display only essential information and controls for regular developers
   - Acceptance: Users see overview, sessions, and basic configuration without advanced features

2. **Advanced Mode - Full Access**
   - Description: Display all features including debug, exec approvals, node management for power users
   - Acceptance: Users can access all existing functionality when in Advanced mode

3. **Mode Toggle**
   - Description: Persistent toggle between Basic and Advanced modes
   - Acceptance: Mode preference persists across sessions (localStorage)

4. **Vercel AI SDK UI Integration**
   - Description: Use AI SDK design patterns and tokens for consistent styling (NOT React components - see Technical Note below)
   - Acceptance: UI follows AI SDK design token patterns for colors, spacing, typography

5. **AI Elements UI Patterns Integration**
   - Description: Use AI Elements design patterns for chat-compatible UI (NOT React components - see Technical Note below)
   - Acceptance: Chat views follow AI Elements Conversation component patterns (reimplemented in Lit)

6. **Consistent Design System**
   - Description: Unified color scheme, typography, spacing across all views
   - Acceptance: All views follow established design tokens

### Edge Cases

1. **Unknown View in Basic Mode** - Redirect to overview or show "Advanced feature" message
2. **Gateway Connection Lost** - Show offline indicator, disable interactions
3. **Mode Toggle While in Advanced-Only View** - Redirect to compatible view or overview
4. **Large Data Sets** - Implement virtualization for sessions/agents lists in both modes

## Implementation Notes

### DO
- Follow the existing Lit component patterns in the codebase
- Use existing CSS design tokens from `ui/src/styles/`
- Reuse existing controllers for gateway communication
- Implement mode toggle in app.ts as global state
- Keep backward compatibility with existing gateway API

### DON'T
- Create new backend endpoints (UI only)
- Remove any existing functionality (just hide in Basic mode)
- Use different state management than existing pattern
- Skip testing in both Basic and Advanced modes
- Attempt to install React libraries (@ai-sdk/react, ai-elements) - these are incompatible with Lit

## Development Environment

### Start Services

```bash
# Start gateway backend
cd /Users/jkneen/Documents/GitHub/atomicbot && pnpm dev

# Start UI development server (in separate terminal)
cd /Users/jkneen/Documents/GitHub/atomicbot/ui && npm run dev
```

### Service URLs
- Gateway UI: http://localhost:3000
- Gateway API: http://localhost:3000

### Required Environment Variables
- None for UI (uses existing .env for gateway connection)

## Success Criteria

The task is complete when:

1. [ ] Existing dashboard views are located and audited
2. [ ] Basic mode shows simplified UI with overview, sessions, basic config
3. [ ] Advanced mode shows full UI with all existing features
4. [ ] Mode toggle persists user preference in localStorage
5. [ ] Vercel AI SDK design patterns adopted for styling (not React library integration)
6. [ ] AI Elements UI patterns adopted for chat components (reimplemented in Lit)
7. [ ] Consistent design system across all views
8. [ ] All existing gateway functionality preserved
9. [ ] Both modes tested and working

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Unit Tests
| Test | File | What to Verify |
|------|------|----------------|
| Mode toggle state | `ui/src/ui/app.test.ts` | Mode state changes and persists |
| Basic mode view filtering | `ui/src/ui/views/*.test.ts` | Only Basic views render in Basic mode |
| Navigation permission check | `ui/src/ui/navigation.test.ts` | Advanced views blocked in Basic mode |

### Integration Tests
| Test | Services | What to Verify |
|------|----------|----------------|
| Gateway communication | UI ↔ Gateway | All RPC calls work in both modes |
| Session list loading | UI ↔ Gateway | Data loads correctly in Basic and Advanced |
| Config save | UI ↔ Gateway | Settings persist correctly |

### End-to-End Tests
| Flow | Steps | Expected Outcome |
|------|-------|------------------|
| Basic mode navigation | 1. Toggle to Basic 2. Try accessing debug | Shows "Advanced feature" message |
| Advanced mode full access | 1. Toggle to Advanced 2. Access all views | All views accessible |
| Mode persistence | 1. Set Advanced 2. Refresh page 3. Check mode | Mode remains Advanced |

### Browser Verification (if frontend)
| Page/Component | URL | Checks |
|----------------|-----|--------|
| Dashboard Overview | http://localhost:3000/#overview | Renders correctly |
| Sessions View | http://localhost:3000/#sessions | Lists sessions |
| Debug View (Advanced) | http://localhost:3000/#debug | Only in Advanced mode |
| Mode Toggle | Any view | Toggle works, persists |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Browser verification complete
- [ ] No regressions in existing functionality
- [ ] Code follows established patterns
- [ ] No security vulnerabilities introduced
- [ ] Basic/Advanced mode toggle works correctly
