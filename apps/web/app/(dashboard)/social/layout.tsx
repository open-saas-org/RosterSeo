import type { CSSProperties } from "react";

// See publish/layout.tsx for why this works - same mechanism, scoped to
// the Social pillar's routes with the sky-blue tokens instead of purple.
const SOCIAL_THEME = {
  "--primary": "var(--sky)",
  "--primary-foreground": "var(--sky-foreground)",
  "--ring": "var(--sky)",
} as CSSProperties;

export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="contents" style={SOCIAL_THEME}>
      {children}
    </div>
  );
}
