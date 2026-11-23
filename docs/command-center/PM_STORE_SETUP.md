# PM store setup

The PM View saves the PM's own data (classifications such as "Production", the Customer Register, edit history, and done or snoozed inbox tasks) in a **separate PM store**. It is not part of the Vacademy platform backend: nothing in it changes platform institutes, lead tags, trials or subscriptions, and no platform service reads it.

Until the store is connected, the PM View still shows every number and list. Only saving is disabled, and a note at the top of the page says so.

## Local development

Nothing to set up. `pnpm dev` (or `npm run dev`) saves to `.pm-data/pm-store.json` in the repo root. Git ignores that folder. Delete the file to start fresh.

## Production (Cloudflare Pages)

The store is a Cloudflare **D1** database bound to the portal's Pages project as `PM_DB`. The tables are created automatically on first use.

1. In the Cloudflare dashboard, go to **Storage & Databases → D1 SQL Database → Create**. Name it `pm-view` (the name doesn't matter).
2. Go to **Workers & Pages**, open the portal's Pages project, then **Settings → Bindings → Add → D1 database**.
   - Variable name: `PM_DB` (exactly this)
   - D1 database: the one you created
   - Add it for **Production** (and Preview if you use it).
3. **Redeploy** (Deployments → latest → Retry deployment). Bindings only apply to new deployments.
4. Open **PM View**. The "PM store isn't connected" note disappears, and marking accounts or saving the register works.

Access uses the same rules as the rest of the portal: the caller must be on `PORTAL_ALLOWED_USERS`, and the backend must accept their session. Every change records the portal username in the edit history.

## Backups and export

- From the app: **PM View → Accounts & register → Export register** downloads every register entry as CSV in the same format the upload accepts.
- From Cloudflare: D1 has Time Travel (point-in-time restore for the last 30 days) under the database's **Settings**, and `wrangler d1 export` produces a SQL dump.

## Tables

| Table | Holds |
|---|---|
| `pm_records` | One row per institute: the full register entry as JSON |
| `pm_history` | Every change: who, when, which fields, old and new values |
| `pm_tasks` | Inbox tasks marked done or snoozed |

Removing the binding or deleting the database removes only PM data. The platform is unaffected.
