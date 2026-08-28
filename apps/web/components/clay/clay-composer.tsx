"use client";

import { useState, type KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function ClayComposer({ disabled, onSend }: { disabled: boolean; onSend: (content: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-[26px] border bg-background p-2 pl-4 shadow-sm transition-shadow focus-within:shadow-md">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? "Clay is thinking…" : "Ask Clay to research, analyze, or track anything…"}
        disabled={disabled}
        rows={1}
        className="min-h-0 resize-none border-none bg-transparent px-0 py-2 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <Button
        size="icon-sm"
        disabled={disabled || !value.trim()}
        onClick={submit}
        className="shrink-0 rounded-full"
      >
        {disabled ? <Loader2 className="animate-spin" /> : <Send />}
        <span className="sr-only">Send</span>
      </Button>
    </div>
  );
}
