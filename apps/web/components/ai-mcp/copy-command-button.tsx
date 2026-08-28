"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

// No clipboard/copy primitive exists in components/ui yet, so this is a
// minimal one-off rather than a new design-system component - just enough
// to make the stdio run command copy-pasteable from the AI & MCP page.
// Wrapped in IconButton so the icon-only trigger gets a real hover tooltip
// instead of relying on aria-label alone, plus a "Copied!" confirmation
// while the copied state is active.
export function CopyCommandButton({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail (permissions, insecure context) - silently
      // no-op, the command is still selectable/readable in the code block.
    }
  }

  return (
    <IconButton
      type="button"
      variant="outline"
      size="icon-sm"
      icon={copied ? Check : Copy}
      label={copied ? "Copied!" : "Copy command"}
      onClick={handleCopy}
      className={copied ? "text-primary" : undefined}
    />
  );
}
