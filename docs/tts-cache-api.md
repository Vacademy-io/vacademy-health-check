# TTS cache analytics — API needed

For a **Cache analytics** tab inside `/calls`. The tab lands on a list of agents, you click one to see
the sentences cached for it, you can hear one before deciding it's wrong, flush it, and see what
*isn't* being cached and why.

All paths are under `/admin-core-service/super-admin/v1`. Paging envelope, field casing and `₹` handling
should match `/calls` exactly: `{ content, page, size, total_elements, total_pages }`, `snake_case`,
rupees as plain numbers.

---

## 1. `GET /tts-cache/agents` — the tab's landing screen

Query: `instituteId`, `from`, `to`, `q` (name search), `page`, `size`.

```jsonc
{
  "content": [{
    "agent_id": "b759218d-…",
    "agent_name": "shreya-v3",
    "institute_id": "ca3c4734-…",
    "institute_name": "Vacademy Admin",
    "tts_model": "smallest_pro",
    "voice": "mrunal",

    "entries": 184,              // sentences currently held
    "chars_cached": 21430,
    "bytes": 8734122,            // storage footprint

    "hits": 512,
    "misses": 96,
    "hit_rate": 0.84,
    "secs_saved": 1840.5,
    "inr_saved": 61.20,

    "never_hit_entries": 37,     // cached, never replayed — the flush candidates
    "oldest_entry_at": "2026-07-02T…",
    "last_hit_at": "2026-08-24T07:10:51Z"
  }],
  "page": 0, "size": 50, "total_elements": 12, "total_pages": 1
}
```

`never_hit_entries` and `hit_rate` are what make this screen worth opening — they say which agent's
cache is doing nothing. There is **no agents endpoint at all today**, so this one also finally lets us
populate the `agentId` filter that `/calls` already accepts.

## 2. `GET /tts-cache/agents/{agentId}/entries` — the sentences

Query: `page`, `size`, `q` (text search), `sort` = `hits | recent | chars | never_hit`, `voice`, `model`.

```jsonc
{
  "content": [{
    "entry_id": "sha256:9f3c…",         // the cache key — what flush takes
    "text": "नमस्ते, मैं श्रेया बोल रही हूँ…",
    "chars": 62,
    "voice": "mrunal",
    "tts_model": "smallest_pro",
    "audio_secs": 4.8,
    "bytes": 46200,
    "hits": 41,
    "last_hit_at": "2026-08-24T07:10:53Z",
    "created_at": "2026-07-02T11:04:00Z",
    "inr_saved": 6.40,
    "source": "scripted_greeting",      // scripted_greeting | template | llm_reply
    "audio_url": "https://…/tts-cache/9f3c….mp3"   // signed, short-lived
  }]
}
```

**`audio_url` is the important one.** "We don't think this cache is built correctly" can only be settled
by listening to what was stored — without it the flush decision is a guess.

## 3. `GET /tts-cache/agents/{agentId}/misses` — what *isn't* cached

Query: `from`, `to`, `minOccurrences` (default 2), `page`, `size`.

```jsonc
{
  "content": [{
    "text": "आपका स्लॉट कल शाम पाँच बजे…",
    "occurrences": 23,
    "chars": 58,
    "first_seen": "2026-08-19T…",
    "last_seen": "2026-08-24T…",
    "est_inr_wasted": 4.10,
    "reason": "NOT_CACHEABLE_DYNAMIC",
    "sample_call_ids": ["996770a6-…", "413ce41b-…"]
  }]
}
```

`reason` ∈ `FIRST_SEEN | BELOW_MIN_CHARS | ABOVE_MAX_CHARS | NOT_CACHEABLE_DYNAMIC | EVICTED | DISABLED`.

Without `reason` this is just a list; with it, it's a work list — `NOT_CACHEABLE_DYNAMIC` on a sentence
repeated 23 times means the template needs splitting, `EVICTED` means the TTL is too short.
`sample_call_ids` lets the row link straight back into the Calls tab.

## 4. Flush

```
DELETE /tts-cache/entries/{entryId}
     → { "deleted": 1, "bytes_freed": 46200, "affects_other_agents": [] }

POST   /tts-cache/agents/{agentId}/flush
  body { "entry_ids": ["sha256:…"],   // omit to scope by the filters below
         "voice": "mrunal", "model": "smallest_pro",
         "older_than": "2026-08-01", "never_hit_only": true,
         "dry_run": true, "note": "greeting re-recorded" }
     → { "matched": 37, "deleted": 0, "bytes_freed": 0, "dry_run": true,
         "affects_other_agents": ["777a8a17-…"] }
```

Two things I'd ask for explicitly:

- **`dry_run`** — a bulk delete with no preview is not something I want to put a button on. The UI will
  always call `dry_run: true` first and show "this will remove 37 entries, 8.3 MB" before the real call.
- **`affects_other_agents`** — see the open question below. If the cache is keyed globally, flushing
  "shreya-v3's cache" silently evicts Shreya's too, and the dialog has to say so.

```
GET /tts-cache/flush-log?agentId=&page=&size=
     → [{ "at": …, "by": "shreyash@vidyayatan.com", "scope": "agent:b759218d…/never_hit",
           "matched": 37, "deleted": 37, "bytes_freed": 8734122, "note": "…" }]
```

## 5. `GET /tts-cache/summary` — monitoring

Query: `from`, `to`, `instituteId`, `agentId`, `bucket` = `hour | day`.

```jsonc
{
  "totals": { "entries": 1840, "bytes": 84331002, "hits": 5120, "misses": 960,
              "hit_rate": 0.84, "secs_saved": 18400, "inr_saved": 612.40,
              "entries_added": 74, "entries_evicted": 12 },
  "series": [{ "bucket": "2026-08-24", "hits": 512, "misses": 96, "hit_rate": 0.84,
               "inr_saved": 61.2, "entries_added": 9, "entries_evicted": 1 }]
}
```

A falling `hit_rate` or a spike in `entries_added` is the signal that a prompt changed and the cache is
being rebuilt from scratch — that's the thing worth watching.

## 6. Add five fields to the existing `GET /calls/summary`

```jsonc
"tts_cache_hits": 812, "tts_cache_misses": 190,
"tts_cache_hit_rate": 0.81, "tts_cache_chars_saved": 41300,
"tts_cache_saved_inr": 71.40
```

The Calls table now has a per-call **Cache** column, but the totals strip above it can't get a Cache tile
without this — client-side I can only sum the 50 rows on screen, which would be wrong for any filter
wider than one page.

---

## Open questions that change the shape of the above

1. **Is the cache keyed per agent, or globally by `hash(text + voice + model)`?**
   This is the big one. If it's global, then "an agent's cache" is a *view over usage*, not ownership —
   per-agent flush has to be expressed as "entries this agent used", and it can hit other agents. Every
   flush response then needs `affects_other_agents`, and the confirm dialog has to name them.
2. **Where does it live — Redis, or a table plus object storage?** Listing entries by agent with text and
   hit counts needs a secondary index. If it's Redis with opaque keys and no index, endpoint 2 is a
   bigger job than the rest and we should sequence it accordingly.
3. **Is `inr_saved` metered or modelled?** `/calls` already flags `cost_is_modelled`. If these numbers
   come off the rate card rather than a vendor bill, send the same flag and I'll label it in the UI.
4. **Is there a TTL / eviction policy?** `reason: "EVICTED"` on the misses list is only meaningful if so.
5. **Who may flush?** Super-admin only, or institute-scoped? Either way `flush-log.by` needs to be the
   real user, not a service account.
