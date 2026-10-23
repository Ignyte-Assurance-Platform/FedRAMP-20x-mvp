import { useId, useRef, useState } from "react";
import { Button } from "~/components/ui/button";

/**
 * The intake link with a Copy button (WI-003). Copy uses the clipboard API and announces
 * "Copied" in a live region; when the clipboard is refused, the link text is selected so the
 * consultant can copy it by hand. An expired link shows "Expired" and Copy is disabled.
 */
export function CopyLink({ url, label = "Intake link", truncate = false }: { url: string | null; label?: string; truncate?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const id = useId();

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Copied");
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage("Copy was blocked. The link is selected: press Ctrl+C (⌘C on a Mac).");
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {url ? (
        <input
          id={id}
          ref={input}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          className={`min-w-0 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs ${truncate ? "w-48 truncate" : "w-full"}`}
        />
      ) : (
        <span id={id} className="text-sm font-medium text-destructive">
          Expired
        </span>
      )}
      <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!url}>
        Copy link
      </Button>
      <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {message}
      </span>
    </div>
  );
}
