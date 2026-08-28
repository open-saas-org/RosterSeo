import type { CSSProperties } from "react";

// Every "primary"-styled element in the app (buttons, links, focus rings,
// checkboxes, switches, the active-tab underline, etc.) reads its color from
// the `--primary`/`--primary-foreground`/`--ring` CSS custom properties
// (see globals.css). Re-declaring them here, scoped to this route
// subtree, re-themes all of that for free - no per-component edits, and no
// risk of missing one - using the exact same mechanism `.dark` already
// uses to swap the whole app's palette. `display: contents` keeps this
// wrapper invisible to the surrounding flex layout in (dashboard)/layout.tsx.
const PUBLISH_THEME = {
  "--primary": "var(--publish)",
  "--primary-foreground": "var(--publish-foreground)",
  "--ring": "var(--publish)",
} as CSSProperties;

export default function PublishLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="contents" style={PUBLISH_THEME}>
      {children}
    </div>
  );
}
