import { useMemo, type ReactNode } from "react";
import { parseDiagnostics } from "@/services/calls-api";

const secs = (n: number | null | undefined) => (n == null ? null : `${n.toFixed(1)}s`);
const ttfb = (n: number | null | undefined) => (n == null ? null : `${Math.round(n * 1000)} ms`);
const pct = (n: number | null | undefined) => (n == null ? null : `${Math.round(n * 100)}%`);
const count = (n: number | null | undefined) => (n == null ? null : String(n));

const LEVEL_TONE: Record<string, string> = {
  RED: "border-red-300 bg-red-50 text-red-700",
  AMBER: "border-amber-300 bg-amber-50 text-amber-700",
  GREEN: "border-emerald-300 bg-emerald-50 text-emerald-700",
};
const levelTone = (level: string | undefined) =>
  LEVEL_TONE[level ?? ""] ?? "border-muted-foreground/30 text-muted-foreground";

/** The bot's cause codes, in the words a human would use. */
function causeLabel(cause: string) {
  const playout = /^awaiting_playout_([\d.]+)s$/.exec(cause);
  if (playout) return `agent's audio wasn't ready (${playout[1]}s)`;
  switch (cause) {
    case "caller_thinking": return "caller went quiet";
    case "caller_speaking": return "caller was still speaking";
    case "after_caller_turn": return "gap after the caller finished";
    default: return cause.replace(/_/g, " ");
  }
}

/** Silence we caused vs silence the caller caused — only the first is our bug. */
const isOurSilence = (cause: string) =>
  cause.startsWith("awaiting_playout") || cause === "after_caller_turn";

function Stat({ label, value, tone }: { label: string; value: string | null; tone?: string }) {
  if (value == null) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm font-medium ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-xs font-medium uppercase text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

export default function CallDiagnosticsPanel({ raw }: { raw: string | null }) {
  const d = useMemo(() => parseDiagnostics(raw), [raw]);

  if (!d) {
    return (
      <p className="text-sm text-muted-foreground">
        {raw
          ? "Diagnostics for this call could not be read."
          : "No diagnostics recorded for this call."}
      </p>
    );
  }

  const l = d.latency;
  const t = d.turnTaking;
  const tts = d.tts;
  const setup = d.setup;
  const infra = d.infra;
  const faults = d.faults ?? [];
  const levels = d.faultLevels ?? {};
  const silences = [...(d.silences ?? [])].sort((a, b) => b.secs - a.secs);
  const ourSilence = silences.filter((s) => isOurSilence(s.cause));
  const worst = silences[0];

  /** Counters worth a chip only when they actually happened. */
  const counters = ([
    ["barge-ins", t?.bargeIns],
    ["ducks", t?.ducks],
    ["duck absorbs", t?.duckAbsorbs],
    ["duck timeout resumes", t?.duckTimeoutResumes],
    ["handbacks", t?.handbacks],
    ["nudges", t?.nudges],
    ["echoes trimmed", t?.echoesTrimmed],
    ["repeats suppressed", t?.repeatsSuppressed],
    ["repeat escalations", t?.repeatEscalations],
    ["unsaid reverted", t?.unsaidReverted],
    ["content-free turns", t?.contentFreeTurns],
    ["empty runs blocked", t?.emptyRunsBlocked],
    ["reply restarts", t?.maxReplyRestarts],
    ["orphan re-asks", t?.orphanReasks],
    ["barge-in cancels", t?.bargeInCancels],
    ["carrier announcements", t?.carrierAnnouncements],
  ] as Array<[string, number | null | undefined]>).filter(([, v]) => (v ?? 0) > 0);

  const flags: string[] = [];
  if (t?.idleHangup) flags.push("caller hung up on silence");
  if (t?.capFarewell) flags.push("ended by the turn cap");
  if (setup?.openingTruncated) flags.push("opening line was cut off");
  if (infra?.transferRequested) {
    flags.push(infra.transferRegistered ? "transfer registered" : "transfer asked for, never registered");
  }
  if (infra?.crash) flags.push(`crash: ${infra.crash}`);
  if (tts?.stallCapHit) flags.push("TTS stall cap hit");

  return (
    <div className="space-y-3">
      {/* What the bot blames the call on */}
      {(d.headlineText || d.headline) && (
        <div
          className={`rounded-md border px-3 py-2 ${levelTone(
            levels[d.headline ?? ""] ?? d.health ?? undefined
          )}`}
        >
          <div className="text-sm font-medium">{d.headlineText ?? d.headline}</div>
          {d.headlineText && d.headline && (
            <div className="font-mono text-[10px] opacity-70">{d.headline}</div>
          )}
        </div>
      )}

      {faults.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {faults.map((f) => (
            <span
              key={f}
              className={`rounded border px-2 py-0.5 font-mono text-[11px] ${levelTone(levels[f])}`}
            >
              {f}
              {levels[f] ? <span className="ml-1 opacity-70">{levels[f]}</span> : null}
            </span>
          ))}
        </div>
      )}

      <Section title="Timing">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="dead air, worst"
            value={secs(l?.deadAirMax)}
            tone={
              (l?.deadAirMax ?? 0) >= 10
                ? "text-red-600"
                : (l?.deadAirMax ?? 0) >= 5
                  ? "text-amber-600"
                  : undefined
            }
          />
          <Stat label="dead air p95" value={secs(l?.deadAirP95)} />
          <Stat label="greeting delay" value={secs(setup?.greetDelaySecs)} />
          <Stat label="greeting" value={setup?.greetPath ?? null} />
          <Stat label="LLM first token p50" value={ttfb(l?.llmTtfbP50)} />
          <Stat
            label="LLM p95"
            value={ttfb(l?.llmTtfbP95)}
            tone={(l?.llmTtfbP95 ?? 0) >= 1 ? "text-amber-600" : undefined}
          />
          <Stat label="STT p50" value={ttfb(l?.sttTtfbP50)} />
          <Stat label="STT p95" value={ttfb(l?.sttTtfbP95)} />
        </div>
      </Section>

      {silences.length > 0 && (
        <Section title={`Silences — ${silences.length}, ${ourSilence.length} ours`}>
          <ul className="space-y-1">
            {silences.map((s, i) => (
              <li key={`${s.cause}-${i}`} className="flex items-baseline gap-2 text-xs">
                <span
                  className={`w-14 shrink-0 text-right font-mono font-medium ${
                    isOurSilence(s.cause)
                      ? s.secs >= 10
                        ? "text-red-600"
                        : "text-amber-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {s.secs.toFixed(1)}s
                </span>
                <span className={isOurSilence(s.cause) ? "" : "text-muted-foreground"}>
                  {causeLabel(s.cause)}
                </span>
              </li>
            ))}
          </ul>
          {worst && isOurSilence(worst.cause) && (
            <p className="mt-2 text-xs text-muted-foreground">
              The caller sat through {worst.secs.toFixed(1)}s of nothing while the agent's audio was
              still coming.
            </p>
          )}
        </Section>
      )}

      <Section title="Turn taking">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="agent turns" value={count(t?.botTurns)} />
          <Stat label="caller turns" value={count(t?.userTurns)} />
          <Stat
            label="answers deleted"
            value={count(t?.answersDeleted)}
            tone={(t?.answersDeleted ?? 0) > 0 ? "text-red-600" : undefined}
          />
          <Stat
            label="fragments lost"
            value={count(t?.fragmentsLost)}
            tone={(t?.fragmentsLost ?? 0) > 0 ? "text-amber-600" : undefined}
          />
          <Stat label="longest caller turn" value={secs(d.machine?.longestUserSecs)} />
          <Stat
            label="replies never played"
            value={count(d.playout?.repliesNeverPlayed)}
            tone={(d.playout?.repliesNeverPlayed ?? 0) > 0 ? "text-red-600" : undefined}
          />
        </div>

        {counters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {counters.map(([label, v]) => (
              <span key={label}>
                <b className="text-foreground">{v}</b> {label}
              </span>
            ))}
          </div>
        )}

        {t?.answersDeletedSamples?.length || t?.fragmentsLostSamples?.length ? (
          <div className="mt-3 space-y-1 text-xs">
            {t?.answersDeletedSamples?.length ? (
              <div>
                <span className="text-muted-foreground">answers dropped: </span>
                {t.answersDeletedSamples.map((x, i) => (
                  <span key={i} className="mr-1 rounded bg-muted px-1 py-0.5 font-mono">
                    {x}
                  </span>
                ))}
              </div>
            ) : null}
            {t?.fragmentsLostSamples?.length ? (
              <div>
                <span className="text-muted-foreground">fragments lost: </span>
                {t.fragmentsLostSamples.map((x, i) => (
                  <span key={i} className="mr-1 rounded bg-muted px-1 py-0.5 font-mono">
                    {x}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Section>

      {tts && (
        <Section title="Speech">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="vendor" value={tts.vendor ?? null} />
            <Stat label="cache hit rate" value={pct(tts.cacheHitRate)} />
            <Stat
              label="cache hits / misses"
              value={
                tts.cacheHits == null && tts.cacheMisses == null
                  ? null
                  : `${tts.cacheHits ?? 0} / ${tts.cacheMisses ?? 0}`
              }
            />
            <Stat
              label="cache saved"
              value={
                tts.cacheSecsSaved
                  ? `${tts.cacheSecsSaved.toFixed(1)}s · ${tts.cacheCharsSaved ?? 0} chars`
                  : null
              }
            />
            <Stat
              label="stalls"
              value={count(tts.stalls)}
              tone={(tts.stalls ?? 0) > 0 ? "text-amber-600" : undefined}
            />
            <Stat
              label="wedges"
              value={count(tts.wedges)}
              tone={(tts.wedges ?? 0) > 0 ? "text-red-600" : undefined}
            />
            <Stat
              label="silent generations"
              value={count(tts.silentGenerations)}
              tone={(tts.silentGenerations ?? 0) > 0 ? "text-red-600" : undefined}
            />
            <Stat label="letterless skipped" value={count(tts.letterlessSkipped)} />
          </div>
        </Section>
      )}

      {(infra || d.machine) && (
        <Section title="Line">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="STT reconnects"
              value={count(infra?.sttReconnects)}
              tone={(infra?.sttReconnects ?? 0) > 0 ? "text-amber-600" : undefined}
            />
            <Stat
              label="hearing failures"
              value={count(infra?.hearingFailures)}
              tone={(infra?.hearingFailures ?? 0) > 0 ? "text-red-600" : undefined}
            />
            <Stat label="unheard utterances" value={count(infra?.unheardUtterances)} />
            <Stat
              label="answering machine"
              value={
                d.machine?.score == null
                  ? null
                  : `${Math.round(d.machine.score * 100)}% (${d.machine.src ?? "?"})`
              }
            />
          </div>
        </Section>
      )}

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <span
              key={f}
              className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      <details className="rounded-md border">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase text-muted-foreground">
          Raw diagnostics{d.rulesVersion != null ? ` · rules v${d.rulesVersion}` : ""}
        </summary>
        <pre className="max-h-96 overflow-auto border-t bg-muted p-3 text-xs">
          {JSON.stringify(d, null, 2)}
        </pre>
      </details>
    </div>
  );
}
