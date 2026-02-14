# Specification: Upgrade Native Apps to Tahoe 26.x Design System

## Overview

This task involves upgrading the native macOS and iOS applications to implement the "liquid glass of Tahoe" design system and support version 26.x while maintaining backward compatibility with earlier versions. The upgrade requires a comprehensive UI overhaul affecting all screens, layouts, panels, buttons, and UI components across both platforms. A formal design guide must be established to ensure consistency across the native applications.

## Workflow Type

**Type**: feature

**Rationale**: This is a major feature implementation involving a complete UI redesign across two platforms. It introduces new visual design elements (glassmorphism, blur effects), creates new design documentation, and requires architectural changes to support both the new 26.x design system and backward compatibility with earlier versions.

## Task Scope

### Services Involved
- **macOS App** (primary) - Native AppKit/SwiftUI application requiring glassmorphism design implementation
- **iOS App** (primary) - Native UIKit/SwiftUI application requiring blur effects and visual consistency

### This Task Will:
- [ ] Implement "liquid glass of Tahoe" glassmorphism design system across all UI components
- [ ] Add support for version 26.x feature requirements
- [ ] Maintain backward compatibility with earlier macOS/iOS versions
- [ ] Establish a comprehensive design guide for screens, layouts, panels, buttons, and UI components
- [ ] Apply consistent visual design across both macOS and iOS platforms
- [ ] Ensure native apps (NOT Electron) comply with new design consistency requirements

### Out of Scope:
- Electron/web application changes
- Backend API modifications
- Database schema changes
- New feature functionality (UI-only changes)

## Service Context

### macOS Application

**Tech Stack:**
- Language: Swift
- Framework: AppKit/SwiftUI
- Key directories: `macos/Sources/OpenClaw/` (100+ Swift source files)

**Entry Point**: `macos/Sources/OpenClaw/` (main app bundle)

**How to Run:**
```bash
# Open in Xcode
open macos/OpenClaw.xcodeproj
# Or build via command line
xcodebuild -project macos/OpenClaw.xcodeproj -scheme OpenClaw -configuration Debug build
```

**Port**: N/A (native macOS app)

### iOS Application

**Tech Stack:**
- Language: Swift
- Framework: UIKit/SwiftUI
- Key directories: `ios/Sources/` (60+ Swift source files)

**Entry Point**: `ios/Sources/OpenClawApp.swift`

**How to Run:**
```bash
# Open in Xcode
open ios/OpenClaw.xcodeproj
# Or build for simulator
xcodebuild -project ios/OpenClaw.xcodeproj -scheme OpenClaw -configuration Debug -destination 'platform=iOS Simulator'
```

**Port**: N/A (native iOS app)

## Files to Modify

| File | Service | What to Change |
|------|---------|---------------|
| `macos/Sources/OpenClaw/**/*.swift` | macOS | Apply glassmorphism (NSVisualEffectView) to UI components |
| `ios/Sources/**/*.swift` | iOS | Apply blur effects (UIVisualEffectView) to UI components |
| `macos/Sources/OpenClaw/CanvasWindow.swift` | macOS | Implement glass panel design |
| `macos/Sources/OpenClaw/ChannelsSettings+View.swift` | macOS | Apply design system to settings panels |
| `ios/Sources/Settings/*.swift` | iOS | Apply design system to settings views |
| `macos/Sources/OpenClaw/*Settings*.swift` | macOS | Update all settings views with new design |
| `ios/Sources/*/*.swift` | iOS | Update all UI views with new design |
| **[Design Guide]** | Both | Create new `docs/design-guide.md` documenting all UI patterns |

**Note**: Specific files will be identified during implementation via UI component audit.

## Files to Reference

These files provide patterns to follow:

| File | Pattern to Copy |
|------|----------------|
| `macos/Sources/OpenClaw/CanvasWindow.swift` | Window/container structure for glassmorphism |
| `macos/Sources/OpenClaw/ContextMenuCardView.swift` | Card/popup UI component styling |
| `ios/Sources/Status/StatusPill.swift` | Status indicator component design |
| `ios/Sources/Status/VoiceWakeToast.swift` | Toast/notification component design |
| Apple Documentation: NSVisualEffectView | macOS glassmorphism implementation |
| Apple Documentation: UIVisualEffectView | iOS blur effect implementation |
| Apple Human Interface Guidelines | Platform-specific design patterns |

## Patterns to Follow

### Glassmorphism Effect (macOS)

From Apple's NSVisualEffectView documentation:

```swift
// Standard glass material implementation
let visualEffectView = NSVisualEffectView()
visualEffectView.material = .hudWindow
visualEffectView.blendingMode = .behindWindow
visualEffectView.state = .active
```

**Key Points:**
- Use `.hudWindow` or `.popover` material for floating panels
- Use `.contentBackground` material for main content areas
- Set `blendingMode = .behindWindow` for translucent backgrounds
- State should be `.active` for interactive elements, `.inactive` for non-interactive

### Blur Effect (iOS)

From Apple's UIVisualEffectView documentation:

```swift
// Standard blur implementation
let blurEffect = UIBlurEffect(style: .systemThickMaterial)
let visualEffectView = UIVisualEffectView(effect: blurEffect)
```

**Key Points:**
- Use `.systemThickMaterial` for prominent glass effects
- Use `.systemMaterial` for standard content backgrounds
- Use `.systemUltraThinMaterial` for subtle overlays
- Apply to entire view backgrounds, not individual elements

### SF Symbols Iconography

```swift
// Consistent icon usage across platforms
Image(systemName: "gear")           // Settings
Image(systemName: "house")          // Home
Image(systemName: "person.circle")  // Profile
```

**Key Points:**
- Use SF Symbols exclusively for all icons
- Prefer filled variants for selected states
- Maintain consistent point sizes (17pt for body, 22pt for navigation)

## Requirements

### Functional Requirements

1. **Liquid Glass Design Implementation**
   - Description: Implement Apple's glassmorphism design across all UI components using NSVisualEffectView (macOS) and UIVisualEffectView (iOS)
   - Acceptance: All windows, panels, and floating elements display translucent glass effect with blur

2. **Version 26.x Support**
   - Description: Ensure all UI components support version 26.x feature requirements including new material styles and animations
   - Acceptance: App builds and runs correctly with 26.x SDK, all new visual features functional

3. **Backward Compatibility**
   - Description: Maintain compatibility with earlier macOS (12+) and iOS (15+) versions
   - Acceptance: UI renders correctly on minimum supported OS versions, graceful degradation for unavailable features

4. **Design Guide Documentation**
   - Description: Create comprehensive design guide covering all UI components, patterns, and usage instructions
   - Acceptance: Document exists at `docs/design-guide.md` with all screens, layouts, panels, buttons, and components documented

5. **Cross-Platform Consistency**
   - Description: Ensure visual consistency between macOS and iOS while respecting platform conventions
   - Acceptance: Similar screens look related but follow their platform's HIG

### Edge Cases

1. **Performance on Older Hardware** - Implement fallback to reduced blur effects on systems without GPU acceleration
2. **High Contrast Mode** - Ensure accessibility by providing high contrast alternatives when system preference is enabled
3. **Dark/Light Mode** - Support both appearance modes with appropriate material selections
4. **Reduced Motion** - Disable or reduce animations when system reduced motion preference is enabled
5. **Notch/Dynamic Island** - Properly handle safe area insets and display cutouts on notched devices

## Implementation Notes

### DO
- Use SwiftUI for new UI components as it provides better cross-platform compatibility
- Follow Apple's Human Interface Guidelines for platform-specific behaviors
- Test on actual devices/simulators with minimum supported OS versions
- Use version checks to conditionally enable 26.x-only features
- Document all new components in the design guide

### DON'T
- Create custom blur implementations when native visual effect views are available
- Mix AppKit and SwiftUI inappropriately - prefer SwiftUI for new components
- Use hardcoded colors - always use semantic colors from the design system
- Skip accessibility testing - glassmorphism can affect readability

## Development Environment

### Prerequisites
- Xcode 15.0+
- macOS 14.0+ (for development)
- iOS 16.0+ Simulator
- Swift 5.9+

### Start Services

```bash
# Verify XcodeGen is installed
which xcodegen || brew install xcodegen

# Generate Xcode projects (if needed)
cd macos && xcodegen generate
cd ios && xcodegen generate
```

### Required Environment Variables
- No special environment variables required for UI development
- Standard Xcode project settings apply

## Success Criteria

The task is complete when:

1. [ ] All macOS UI components implemented with NSVisualEffectView glassmorphism
2. [ ] All iOS UI components implemented with UIVisualEffectView blur effects
3. [ ] Version 26.x features functional and builds successfully
4. [ ] Backward compatibility verified on minimum OS versions (macOS 12+, iOS 15+)
5. [ ] Design guide created at `docs/design-guide.md` with complete component documentation
6. [ ] Visual consistency maintained across both platforms
7. [ ] Accessibility requirements met (VoiceOver, Dynamic Type, High Contrast)
8. [ ] No regressions in existing functionality

## QA Acceptance Criteria

**CRITICAL**: These criteria must be verified by the QA Agent before sign-off.

### Visual Verification
| Check | Platform | What to Verify |
|-------|----------|----------------|
| Glassmorphism effect | macOS | Windows and panels display translucent blur effect |
| Blur effect | iOS | Views display system material blur correctly |
| Dark mode | Both | UI adapts correctly to system appearance |
| High contrast | Both | Readable when accessibility features enabled |

### Build Verification
| Check | Command | Expected |
|-------|---------|----------|
| macOS build | `xcodebuild -project macos/OpenClaw.xcodeproj -scheme OpenClaw -configuration Debug build` | Success |
| iOS build | `xcodebuild -project ios/OpenClaw.xcodeproj -scheme OpenClaw -configuration Debug -destination 'platform=iOS Simulator' build` | Success |
| Backward compatibility | Build against minimum SDK | Success |

### Design Guide Verification
| Check | Location | What to Verify |
|-------|----------|----------------|
| Screen documentation | `docs/design-guide.md` | All major screens documented |
| Layout patterns | `docs/design-guide.md` | Layout patterns specified |
| Component library | `docs/design-guide.md` | All buttons, panels, cards documented |
| Usage examples | `docs/design-guide.md` | Code examples provided |

### Platform-Specific Verification
| Platform | Check | Method |
|----------|-------|--------|
| macOS | Window chrome | Verify visual effect view in titlebar area |
| macOS | Panels | Verify popover/sheet glass effects |
| iOS | Navigation | Verify safe area handling |
| iOS | Modals | Verify blur presentation |

### Regression Testing
| Test | What to Verify |
|------|----------------|
| Existing unit tests | All tests in `ios/Tests/` and `macos/Tests/` pass |
| Core functionality | App launches without crashes |
| Navigation | All screens accessible |

### QA Sign-off Requirements
- [ ] All unit tests pass
- [ ] Both macOS and iOS builds succeed
- [ ] Visual verification complete (glassmorphism, blur effects)
- [ ] Design guide documentation complete
- [ ] Backward compatibility verified on minimum OS versions
- [ ] No regressions in existing functionality
- [ ] Accessibility requirements met
