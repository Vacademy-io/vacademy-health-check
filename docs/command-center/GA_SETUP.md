# Connect Google Analytics to the Command Center

**For:** whoever has admin access to the Google Analytics properties, Google Cloud and the portal's Cloudflare Pages project.
**Takes:** about 20 minutes.
**Result:** **Command Center → Analytics** in the super admin portal shows daily website visitors, new visitors, sessions, devices, traffic sources and demo requests for each product.

> **Never paste the key file into chat, email, Slack or a ticket, and never commit it to git.** It goes in exactly two places: the `secrets/` folder on your own machine (git ignores that folder) and Cloudflare's encrypted secrets.

---

## What's already known

| Product | Website | Analytics tag on the site | GA4 property |
|---|---|---|---|
| Voomsales | voomsales.com | `G-5VXCVMX3EH` (GA4, direct) | Its own property |
| Vacademy.io | vacademy.io | `GTM-5C4DDJ6W` (Tag Manager) | The property behind that container |
| Telleo | telleo.ai | `GTM-5C4DDJ6W` (same container) | Probably the same property as vacademy.io |
| Evalezy | evalezy.com | `GTM-5C4DDJ6W` (same container) | Probably the same property as vacademy.io |

Because three sites share one tag container, they probably report to one GA4 property. The portal splits them by **hostname**, which you'll check in step 3.

---

## Step 1: Create a service account in Google Cloud

1. Go to <https://console.cloud.google.com/> and pick a project, or create one (for example `vacademy-analytics`).
2. **APIs & Services → Library**, search for **Google Analytics Data API**, then click **Enable**.
3. **IAM & Admin → Service Accounts → Create service account**.
   - Name: `command-center-ga`
   - Skip "Grant this service account access to project" (no project roles are needed).
   - Click **Done**.
4. Open the new service account, then **Keys → Add key → Create new key → JSON → Create**. A `.json` file downloads.
5. Copy the service account's **email**. It looks like `command-center-ga@<project>.iam.gserviceaccount.com`.

## Step 2: Give it read access to each GA4 property

Do this for **every** property the products use (probably two: Voomsales's, and the one behind `GTM-5C4DDJ6W`).

1. Go to <https://analytics.google.com/> and open the property.
2. **Admin (gear) → Property → Property access management → + → Add users**.
3. Paste the service account email, choose the role **Viewer**, untick "Notify new users", then click **Add**.
4. Still in Admin: **Property → Property details**. Copy the **Property ID**. It's a **number** like `412345678`, **not** the `G-…` measurement ID.

**Not sure which property is behind `GTM-5C4DDJ6W`?** Open <https://tagmanager.google.com/>, then that container, then **Tags**. Find the *Google tag* or *GA4 Configuration* tag and note its `G-…` ID. In GA, go to **Admin → Data streams**; the stream with that `G-…` ID belongs to the property you need.

## Step 3: Check the hostnames (only for the shared property)

1. In that property: **Reports → Engagement → Pages and screens**.
2. Click **+** next to the table's first column and add the dimension **Hostname**.
3. Note the exact hostnames, for example `vacademy.io`, `www.vacademy.io`, `telleo.ai`, `www.telleo.ai`, `evalezy.com`, `www.evalezy.com`.

## Step 4: Write the product list (`GA_PRODUCTS`)

Replace the IDs and hostnames with yours. Keep it on **one line** when you paste it into an env file.

```json
[
  {"product":"voomsales","propertyId":"111111111"},
  {"product":"vacademy","propertyId":"222222222","hostnames":["vacademy.io","www.vacademy.io"]},
  {"product":"telleo","propertyId":"222222222","hostnames":["telleo.ai","www.telleo.ai"]},
  {"product":"evalezy","propertyId":"222222222","hostnames":["evalezy.com","www.evalezy.com"]}
]
```

- `product` must be one of `vacademy`, `voomsales`, `telleo`, `evalezy`.
- Leave `hostnames` out when a property belongs to one site only.
- **Demo requests** count these GA events by default: `generate_lead` (Voomsales), `demo_request` (vacademy.io), `demo_form_submit` and `trial_signup_complete`. If a site uses other event names, add `"leadEvents":["your_event"]` to that entry.

## Step 5: Try it locally

1. Create a `secrets` folder in the repo root and put the key file there, named `ga-service-account.json`. Git ignores this folder.
2. Create `.env.local` in the repo root (git ignores it too):
   ```
   GA_SERVICE_ACCOUNT_FILE=secrets/ga-service-account.json
   GA_PRODUCTS=[{"product":"voomsales","propertyId":"111111111"},{"product":"vacademy","propertyId":"222222222","hostnames":["vacademy.io","www.vacademy.io"]},{"product":"telleo","propertyId":"222222222","hostnames":["telleo.ai","www.telleo.ai"]},{"product":"evalezy","propertyId":"222222222","hostnames":["evalezy.com","www.evalezy.com"]}]
   ```
   Don't use a `VITE_` prefix: that would put the values into the browser bundle.
3. Restart `pnpm dev`, sign in, and open **Command Center → Analytics**.

## Step 6: Turn it on in production (Cloudflare Pages)

1. In the Cloudflare dashboard, go to **Workers & Pages**, open the portal's Pages project, then **Settings → Variables and Secrets**.
2. Add, for **Production** (and Preview if you use it):
   - `GA_SERVICE_ACCOUNT_JSON`: type **Secret**. Paste the **entire contents** of the key file.
   - `GA_PRODUCTS`: the same one-line JSON as above (it can be plain text).
3. Check that `PORTAL_ALLOWED_USERS` is still set. The analytics route uses the same allowlist and refuses everyone when it's empty.
4. **Redeploy** (Deployments → latest → Retry deployment). New variables only apply to new deployments.

---

## If something's wrong

| What the Analytics tab says | Cause | Fix |
|---|---|---|
| "Google Analytics isn't connected yet: GA_SERVICE_ACCOUNT_JSON is not set" | The key isn't configured | Step 5 (local) or step 6 (production), then restart or redeploy |
| "GA_PRODUCTS … not valid JSON" / "needs a numeric propertyId" | A typo in the product list, or the `G-…` ID used instead of the property ID | Fix the JSON; use the number from Property details |
| "User does not have sufficient permissions for this property" | The service account isn't a Viewer on that property | Step 2 for that property |
| "Google Analytics Data API has not been used in project … or it is disabled" | The API isn't enabled | Step 1.2, then wait a few minutes |
| "Google sign-in failed: invalid_grant" | The key was deleted or the machine's clock is wrong | Create a new key (step 1.4) and replace it |
| A product shows all zeros | The hostnames don't match exactly | Step 3; copy the hostnames exactly as GA shows them |
| Demo requests are always 0 | The site sends a different event name | Add `leadEvents` for that product (step 4) |

Numbers are cached for 10 minutes. GA itself can take up to a day to finalise yesterday's figures.

## What the portal does with the key

- The key is only used server-side: by the portal's Cloudflare Function in production, or by the dev server locally. It is never sent to the browser.
- Before answering, the function checks that the caller is signed in to the portal **and** on `PORTAL_ALLOWED_USERS`, and the backend must accept their session.
- Access is read-only (`analytics.readonly`). To revoke it, delete the key in Google Cloud or remove the service account from the GA property.
