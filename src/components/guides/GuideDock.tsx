import { useState } from "react";
import { useLocation } from "react-router-dom";
import { BookOpen, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGuides, guidesForRoute, type GuideDto } from "@/services/guides-api";

/**
 * Floating "Guides" button, present on every authed page. Shows the walkthroughs relevant to the
 * current route. Guides themselves are managed at /guides (Settings) — no code change needed to
 * add one.
 */
export function GuideDock() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<GuideDto | null>(null);

  const { data } = useGuides();
  const guides = guidesForRoute(data ?? [], pathname);

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40">
        {open && (
          <div className="absolute bottom-14 right-0 flex w-72 flex-col overflow-hidden rounded-lg border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Guides</p>
              </div>
              <button
                type="button"
                aria-label="Close guides"
                onClick={() => setOpen(false)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {guides.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No guides for this page yet.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {guides.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActive(g);
                          setOpen(false);
                        }}
                        className="group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="flex-1 truncate">{g.title}</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <button
          type="button"
          aria-label="Guides"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "relative flex h-12 w-12 items-center justify-center rounded-full border bg-card shadow-lg transition-colors hover:bg-accent",
            open && "bg-accent"
          )}
        >
          <BookOpen className="h-5 w-5" />
          {guides.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {guides.length}
            </span>
          ) : null}
        </button>
      </div>

      {active ? <GuideViewer guide={active} onClose={() => setActive(null)} /> : null}
    </>
  );
}

function GuideViewer({ guide, onClose }: { guide: GuideDto; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/60 p-4 sm:p-10"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex size-full max-w-5xl flex-col overflow-hidden rounded-lg bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
          <p className="truncate text-sm font-semibold">{guide.title}</p>
          <button
            type="button"
            aria-label="Close guide"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative flex-1 bg-muted/30">
          <iframe
            title={guide.title}
            src={guide.fileUrl}
            className="size-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
