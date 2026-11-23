# PM View: plan for a growth product manager

Status: Phase 1 built (21 Nov 2026) · replaces the Command Center tab in the health dashboard. PM store setup: PM_STORE_SETUP.md.
Data fixes found in the Command Center audit are tracked separately and are not part of this plan.

## 0. Isolation rule: the PM View never changes platform data

Everything done in the PM View stays in the PM View.

- **Platform data is read-only.** The PM View reads institutes, lead tags, subscriptions, quotes, activity and GA, and never writes any of them back. Marking an institute "Production", "Test" or "Lost", setting a stage, owner or plan, entering contract dates or prices, and uploading a CSV changes **nothing** in the platform backend, the Institutes page, lead tags, subscriptions or billing.
- **The PM View has its own separate store.** Classifications, the Customer Register, notes, saved views, targets, annotations, the experiment log and the email log live in a separate PM database that the platform backend doesn't read or write. Recommended option: a Cloudflare D1 database bound to the portal's own Pages project, which is fully outside the Vacademy backend and its databases. Deleting it would leave the platform untouched.
- **The two sets of labels are kept apart.** The PM View shows platform values (lead tag, subscription status) and PM values (classification, register contract) in separate columns. When they differ it **flags** the difference and never syncs either way.
- **No platform actions from the PM View.** Extend trial, convert, create a subscription, change a lead tag and provision a workspace are not available here. Where useful, the account drawer has a link "Open in Institutes / Subscriptions", which opens the existing page where that change is made deliberately.
- **The current "Start a trial" button**, which provisions a real workspace, is not carried into the PM View. It stays on the existing pages.
- **Enforced in code, not only in the UI.** PM View code only calls platform endpoints with GET. All PM writes go to the PM store's own endpoints. An automated test fails the build if any PM View file calls a platform POST, PUT, PATCH or DELETE endpoint.
- **Emails** (renewal, anniversary) are the only outbound action. They send messages and log them in the PM store, but don't change platform records.

## 0a. Unit of measure: a user is an institute

For every PM View metric a **user is an institute**: active users = institutes with someone signed in, retention and churn are counted in institutes, and the funnel ends in institutes. Students and staff are shown as supporting detail (students per institute, people signed in), never as the headline number.

## 1. The job this screen does

A growth PM at a multi-product company (Vacademy.io, Voomsales, Telleo, Evalezy) owns one outcome: **more institutes paying, and staying.** Day to day that means finding where good leads come from, getting trials to value fast, keeping paying customers healthy, and reporting on it every week.

The PM View is the **one tab you open at 9 am and keep open all day.** It tells you what to do, shows you why the numbers moved, and gives you the report when you need it.

**North-star metric (to confirm):** paying institutes that are active each week. MRR is the money view of the same thing.

## 2. Metric tree (AARRR)

| Stage | Question it answers | Key metrics | Data source |
|---|---|---|---|
| Acquisition | Where do people come from? | Visitors, leads, signups by source / medium / campaign / landing page; lead velocity; cost per lead (once ad spend is added) | GA, demo quotes, institutes |
| Activation | Do they reach value? | % of new accounts reaching "aha" within 7 days, time to value, onboarding completion % | Profile completion, courses, students, calls, evaluations |
| Retention | Do they keep using it? | WAU/MAU, weekly cohort retention, logo churn, revenue churn, at-risk accounts | Auth activity, usage, subscriptions |
| Referral | Do they bring others? | Referred signups, referral conversion, top referrers | Referral codes (new) |
| Revenue | Is it turning into money? | MRR, new / expansion / contraction / churned MRR, trial→paid %, average revenue per account, payments due, plan mix | Subscriptions, AI plans, credits, Customer Register |

## 3. The PM's day

| When | Task | Section | Result |
|---|---|---|---|
| 9:00 (10 min) | Morning check | Today strip + scorecard | Spot problems and wins first |
| 9:15 | Lead triage | Inbox → New leads | Every demo request contacted the same day |
| 10:00 | Trial care | Inbox → Trials at risk | Nudge, extend or call trials that are ending or haven't activated |
| 11:30 | Channel check | Acquisition | Push the channels that work, pause the ones that don't |
| 14:00 | Customer health and renewals | Accounts, Customer Register, renewal calendar | Save at-risk payers, prepare renewals, find upsells |
| 16:00 | Analysis and experiments | Funnel, cohorts, experiment log | Find the biggest drop-off, plan the next test |
| 17:30 | Wrap-up | Notes, annotations | Context recorded; tomorrow's digest goes out automatically |
| Monday | Weekly business review | Weekly mode → Present | Team meeting run from the screen |
| 1st of month | Monthly growth report | Monthly mode → Export PDF | Leadership or investor update |

## 4. The screen, top to bottom

**A. Command bar (sticky).** Period (Today / 7d / 30d / Quarter / Custom) compared with the previous period; filters for product, source, plan, region and **"All institutes / Production clients only"**; Daily / Weekly / Monthly mode; Export, Present, Refresh; "data as of hh:mm".

**B. Action inbox, "Your day".** Tasks created automatically from the data. Each can be done, snoozed or assigned (stored in the PM store only) and links to the account or the right existing page:
- New leads and demo requests not contacted yet
- Trials ending in ≤3 days; trials with no login in 48 hours
- Payments due or failed; renewals in the next 30 days (with ₹ at stake)
- Anniversaries this week
- Paying accounts with usage down more than 50%
- Upsell signals: near plan limits, heavy AI credit use, many students added
- Data issues: tracking stopped, a product with zero traffic, register vs platform mismatch

**C. North star and AARRR scorecard.** Five tiles: value, change vs previous period, sparkline, target, pacing.

**D. Full funnel.** Visitor → Lead → Account → Activated → Trial → Paid, with conversion and median days per step, split by product and source; the biggest drop-off highlighted; clicking a step lists the accounts at that step.

**E. Acquisition.** Source / medium / campaign carried through to the end of the funnel (visitors → leads → accounts → trials → paid → MRR); top landing pages; geography; devices; lead velocity.

**F. Activation.** Onboarding completion, time to value, activation by source and product.

**G. Retention.** Cohort heatmap, WAU/MAU, churned accounts with the reason, at-risk list.

**H. Revenue.** MRR waterfall (start → new → expansion → contraction → churn → end), trial→paid, average revenue per account, plan mix, collections due.

**I. Referral.** Top referrers, referred signups, referred vs non-referred conversion.

**J. Accounts list.** See section 5.

**K. Annotations and experiment log.** Events pinned on charts; hypothesis / metric / dates / result for each experiment.

**L. Customer Register and renewal calendar.** See section 6.

## 5. Accounts list: see everyone, select anyone

One live list of **every institute on the platform**, the starting point for the register, emails and exports.

**Columns:** institute, products, **platform tag** (read-only, from the backend), **PM classification** (Production / Trial / Demo / Test / Internal / Lost / Not yet reviewed, stored in the PM store), mismatch flag, created date, last login, active users in the last 7 and 30 days, students, courses, plan, subscription status, MRR, trial or contract end, health score, source, owner.

**Quick filters (one click):**
- **Active accounts:** someone logged in during the last 7 / 30 days
- **Production accounts:** by platform data (tagged PROD or with a paid subscription) or by PM classification; you choose which
- **On trial / demo**, **Expiring soon**, **Inactive 14+ days**, **Test / internal**
- **Not yet reviewed:** not classified in the register yet
- Combine filters freely, e.g. *Active + Production + not yet reviewed*

**Select and act:**
- Tick rows one by one, or "select all matching filter"
- Bulk actions on the selection (all saved in the PM store only, nothing sent to the platform):
  - **Mark as Production** (opens the register form for each, pre-filled) or mark as Trial / Test / Internal / Lost
  - Set PM stage, owner, plan label
  - Add to an email campaign (renewal, anniversary, announcement)
  - Export the selection (CSV / Excel)
- **Saved views**, e.g. "Active production accounts", "Trials ending this week", "Paid but inactive 14 days", "Free accounts with high usage"

**Account drawer** (click a row): full timeline from first-touch source → signup → logins → key actions → payments → emails sent → notes, with PM actions (classify, edit register entry, add note, send email) and links "Open in Institutes / Subscriptions" for any platform change, which is made on those existing pages, not here.

Typical first use: filter **Active institutes + PROD / paying on platform**, review the ~50, tick the 20 production clients, mark them Production, fill in their contract details. From then on every "Production clients only" number and every renewal email comes from those 20.

## 6. Customer Register: manual entry and upload

The platform knows an institute *exists*; it doesn't know it's a production client, what was agreed, or when the contract really started. The register is where the PM confirms that, and it becomes the source the PM View trusts for customer numbers and lifecycle emails. It sits beside platform subscriptions: both are shown side by side and mismatches are flagged, but the register never creates or edits a platform subscription or tag (see section 0).

### Fields per institute

| Group | Fields |
|---|---|
| Identity | Institute (from the live list), products, classification (Production / Trial / Demo / Test / Internal / Lost), owner |
| Contacts | Primary contact, decision maker, billing contact (name, email, phone, role); optional birthdays |
| Contract | Plan name, subscription type (monthly / quarterly / annual / one-time / custom), start date, end date, renewal date, auto-renew, notice period |
| Pricing | List price, discount, final price, currency, GST, billing cycle, payment mode (Razorpay / bank transfer / cash / invoice), seats or students, AI credits included |
| Payments | Payment history (date, amount, invoice number, status), next payment due |
| Key dates | Signed on, go-live, first payment, anniversary (from go-live, can be changed), custom dates (e.g. academic year start) |
| Context | Acquisition source, referred by, notes, attachments (agreement, PO, invoices) |

### Ways to fill it in
1. **From the accounts list:** select and mark Production (section 5); the form is pre-filled from platform data.
2. **Add one manually:** full form, including clients not on the platform yet.
3. **Bulk upload:** download the CSV/Excel template, fill it in, upload. The preview matches rows to institutes by ID, subdomain or email; flags unmatched rows, duplicates and invalid dates; and shows what will be created or changed before saving.
4. **Edit history:** who changed what and when, with the old value.
5. **Export:** the full register or any filtered view.

### What it unlocks
- **Lifecycle emails:**

  | Trigger | Example |
  |---|---|
  | Renewal reminder | 30, 15, 7, 1 days before renewal |
  | Expired, not renewed | Day 0, then day 7 |
  | Payment due or overdue | When due, then after 3 days |
  | Anniversary | "1 year with us" on the go-live anniversary |
  | Welcome / onboarding | When marked production |
  | Custom dates | Birthdays, academic year start, festivals |

  Templates with merge fields (`{institute}`, `{plan}`, `{renewal_date}`); auto-send or wait for approval; every send logged on the timeline.
- **Renewal calendar:** month view of renewals, expiries and anniversaries with ₹ at stake.
- **Trustworthy numbers:** MRR, churn and renewal rate from the contract values entered; "Production clients only" filter everywhere.
- **Mismatch flags:** e.g. register says annual ₹60k but the platform subscription is ₹0 complimentary; marked production but tagged TEST.

## 7. How it helps you analyse

- **Why did it change?** Any change in a number is split into its contributors ("Signups +18, mostly vacademy.io organic +12").
- **Segment anything:** product, source, plan, region, production vs all.
- **Compare:** period vs period, cohort vs cohort.
- **Anomaly alerts:** anything more than ±40% from its 7-day average goes to the inbox.
- **Goals and pacing:** monthly targets, on-track status every day.
- **Health score (0–100):** logins, depth of usage, onboarding %, payment status, days left on trial or contract.

## 8. Exports and reports

| Report | Audience | Cadence | Contents | Format |
|---|---|---|---|---|
| Daily digest | PM, sales | 9 am, automatic | Yesterday vs 7-day average, alerts, today's tasks, renewals due | Email / Slack |
| Weekly business review | Product and growth team | Monday | Scorecard, funnel by source, wins and losses, trials converted and lost, experiments, auto-written summary | PDF + Present mode |
| Monthly growth report | Leadership / investors | Monthly | MRR movement, cohorts, channel ROI, goals vs actual, renewals | PDF / slides |
| Data exports | Anyone | On demand or scheduled | Any filtered account view or selection, register, leads with source, trials, subscriptions, source performance, daily series, cohort table | CSV / Excel |

Every export shows the filters and date range it was made with.

## 9. New data this needs

| Data | Why |
|---|---|
| **Separate PM store** (Cloudflare D1 on the portal's Pages project): classifications, Customer Register (record, contacts, payments, attachments, edit history), notes, saved views, targets, annotations, experiments, email log | Manual entry, upload, renewal and anniversary emails, all without touching the platform backend |
| First-touch source on each account (UTM, referrer, landing page) | Ties GA sources to accounts and revenue |
| Activation event per product | Defines "reached value" |
| Last login and active users per institute | Active-accounts filter, health score |
| Lead status, owner, notes | Working inbox |
| Referral codes | Referral stage |
| Targets, annotations, experiment log | Pacing and analysis context |
| Products per institute | Split accounts and revenue by product |

## 10. Build order

1. **Phase 1, "run my day":** command bar, action inbox, scorecard, **accounts list with filters, selection and saved views**, **Customer Register (manual entry, bulk upload, export)**, renewal calendar, acquisition by source, CSV export.
2. **Phase 2, "understand why":** funnel by source and product, cohorts, MRR waterfall, activation, annotations, "why did it change", WBR as PDF.
3. **Phase 3, "run on autopilot":** lifecycle emails, daily digest, anomaly alerts, goals and pacing, Present mode, referral, experiment log, monthly report.

## 11. Open decisions

1. North-star metric: active paying institutes or MRR?
2. Activation event for each product.
3. Does sales use the inbox too (owners and assignment), or only the PM?
4. ~~Should marking a client "Production" also set the platform tag?~~ Decided: no. The PM View is isolated and only flags differences (section 0).
5. Where the PM store lives: Cloudflare D1 on the portal (recommended, fully outside the backend) or a separate service.
6. Email channel: the platform's existing email sending or a separate tool?
