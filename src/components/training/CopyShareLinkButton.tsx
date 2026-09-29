import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTrainingVideoShortLink, type TrainingVideoDto } from "@/services/training-videos-api";

/** The async Clipboard API can refuse after a network round-trip (Safari); fall back to execCommand. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

type State = { kind: "idle" } | { kind: "busy" } | { kind: "copied"; url: string } | { kind: "failed" };

/**
 * Copies the video's short link so it can be pasted to a client. The link is created on click
 * (not on render — get-or-create inserts a row); if the shortener fails, the direct file URL is
 * copied instead.
 */
export function CopyShareLinkButton({ video }: { video: TrainingVideoDto }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<State>({ kind: "idle" });

  const copy = async () => {
    setState({ kind: "busy" });
    let url = video.fileUrl;
    try {
      url = await queryClient.fetchQuery({
        queryKey: ["short-link", "TRAINING_VIDEO", video.id],
        queryFn: () => getTrainingVideoShortLink(video),
        staleTime: Infinity,
      });
    } catch {
      // Keep the long URL.
    }
    const ok = await copyText(url);
    setState(ok ? { kind: "copied", url } : { kind: "failed" });
    setTimeout(() => setState({ kind: "idle" }), 2500);
  };

  const title =
    state.kind === "copied"
      ? `Copied ${state.url.replace(/^https?:\/\//, "")}`
      : state.kind === "failed"
        ? "Couldn't copy the link"
        : "Copy share link";

  return (
    <Button variant="ghost" size="sm" title={title} disabled={state.kind === "busy"} onClick={copy}>
      {state.kind === "busy" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state.kind === "copied" ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : state.kind === "failed" ? (
        <AlertTriangle className="h-4 w-4 text-destructive" />
      ) : (
        <Link2 className="h-4 w-4" />
      )}
      <span className="ml-1 hidden sm:inline">{state.kind === "copied" ? "Copied" : "Share link"}</span>
    </Button>
  );
}
