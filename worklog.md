---
Task ID: color-theme-fix
Agent: main
Task: Fix color theme system - colors not applying when changed in settings

Work Log:
- Diagnosed 5 critical bugs in the theme system
- Bug 1: ColorPicker used bare HSL values ("160 84% 39%") but globals.css uses oklch() format → incompatible
- Bug 2: No startup initialization - colors from DB were never loaded on app boot
- Bug 3: Secondary color was saved but never applied to any CSS variable
- Bug 4: 50+ hardcoded emerald-* classes across 14 files instead of semantic primary/secondary classes
- Bug 5: Legacy hsl(var(--...)) inline styles in sidebar and financial-dashboard

Fixes Applied:
1. Rewrote color-picker.tsx with oklch format, light/dark variants, exported applyPrimaryColor/applySecondaryColor functions
2. Created settings-initializer.tsx component that loads settings from DB on app mount and applies colors + theme
3. Added settings-initializer to app-shell.tsx
4. Implemented secondary color application to --secondary CSS variable
5. Replaced ALL hardcoded emerald-* classes in 14+ files with semantic classes (bg-primary, text-primary, etc.)
6. Fixed hsl(var(...)) inline styles in financial-dashboard.tsx
7. Extended useAppStore with settings state and useSetting hook for reactive access
8. Made sidebar show dynamic business name and logo from settings
9. Made login page fetch business name and apply saved colors on load
10. Added MutationObserver to re-apply colors on dark/light theme toggle

Stage Summary:
- Color theme system now works end-to-end: DB → API → Initializer → CSS variables → UI
- Changing primary/secondary color in settings applies immediately with live preview
- Colors persist across page reloads
- Business name and logo update dynamically across sidebar and login
- All 14 files updated to use semantic color classes instead of hardcoded emerald
