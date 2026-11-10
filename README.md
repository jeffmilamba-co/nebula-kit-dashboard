# Kit Ops: kit lifecycle dashboard

Kit Ops is a dashboard for Nebula's operations team. It brings the kit journey into one place: where each kit is now, how long it has been sitting at its current stage, and which orders are starting to need attention. I built it for the Nebula Genomics take-home exercise using the synthetic export dated 20 October 2026.

**Live app:** https://jeffmilamba-co.github.io/nebula-kit-dashboard/ · **Source:** https://github.com/jeffmilamba-co/nebula-kit-dashboard · **Engineering guide:** [DEVELOPMENT.md](DEVELOPMENT.md)

There is no backend. The app is a static React application, and CSV parsing happens in a Web Worker in the browser. Uploaded files stay on the user's machine; the dashboard does not send them to a server.

I also wanted the project to be testable beyond a quick visual check. The deployment workflow runs three sets of checks and only publishes when they pass:

- **74 unit tests** for the data layer.
- A **Playwright end-to-end suite** covering the requirements in the brief, along with navigation and file uploads.
- **axe accessibility scans** on desktop and phone layouts.

## What the dashboard covers

I used the questions in the brief to shape the main pages. Each page has a clear job, rather than trying to put every metric on one screen.

| Question | Where to find the answer |
| --- | --- |
| How is the pipeline performing? How many kits are in progress, and how many are complete? | **Overview:** headline metrics, orders by stage and health, and weekly volume by product. |
| How long does each stage take, and does the timing vary by product? | **Turnaround:** median and p90 durations against the target for each stage, both by product and across all products. |
| Which kits are waiting too long and need someone to follow up? | **Follow-up:** queues grouped by owner, with a suggested next action and CSV export. |
| What has happened to a particular order? | **Orders:** search by order, kit or customer ID to see every kit, scan and stage duration. |
| Can the data be narrowed by date, product or country? | **Filter bar:** applies across all pages, with the selected filters preserved in the URL. |
| Can the dashboard use a different pair of CSV files? | **Data:** upload replacement files and review each cleaning rule, including how many rows it affected. |

I added a few things that weren't explicitly required, but make the dashboard more useful to explore:

- Every view has its own shareable URL, including filtered views and individual orders.
- The **view as of** date lets you look back and see what the pipeline looked like at an earlier point in time.
- The layout also works at phone width; the main views aren't limited to a desktop screen.

## What the sample data shows

These figures are taken from the last event in the files: **19 October 2026 at 23:46 UTC**. The view includes paid orders and excludes test orders.

- There are **3,902 kit orders**. A report is ready for **2,496 (64%)** of them; the other **1,406** are still in progress.
- **321 orders are overdue.** The striking part is where they are stuck: **278 customers have not mailed their sample back**. No other stage has more than 22 overdue orders, so this is where most of the follow-up effort is going.
- The completed kits alone make the process look healthier than it is. On that basis, the delivered-to-sample-mailed stage is **97% on time**. But that leaves out customers whose kits have been sitting with them for more than 45 days and whose samples still haven't come back. Include those orders and the rate is **90%**. I use the second figure in the dashboard because it includes the work that is still waiting, not just the work that has finished.

## Data rules and assumptions

I didn't want the dashboard to quietly discard rows or make assumptions that a user couldn't see. The rules below are implemented in `src/data/` and covered by tests. The **Data** page in the app lists them and shows how many rows were affected by each one.

### Time handling

- **The dashboard's "now" comes from the data, not the computer's clock.** I use the latest timestamp in the files as the reference point. This is a snapshot export; comparing every open kit with today's date would make old orders look overdue simply because the export is no longer current. The as-of control lets you move the reference date and replay the pipeline.
- **Timestamps without a timezone are treated as UTC.** The files contain 20,658 timestamps ending in `Z`, 3,289 with an explicit offset, and 248 with no timezone. I checked events that appear in both forms: the values line up exactly when the zone-less timestamp is read as UTC. That's why I chose UTC rather than guessing based on the viewer's local timezone.
  - The app uses an explicit timestamp parser. It does not call `Date.parse` on CSV values, because JavaScript would interpret a zone-less timestamp in the local timezone.
  - The unit tests run in Los Angeles time. That makes an accidental local-time conversion show up in the tests instead of slipping through on a UTC machine.
- **Order dates are grouped by UTC day.** The `created_at` field includes the customer's local offset, but the daily grouping uses UTC. So an order placed during the evening in the US can appear under the following UTC date. On the order detail page, I show both the local time and the UTC time so the difference is visible.
- **Durations are elapsed calendar days**, which is how the targets are defined in the brief.

### Data cleaning

- **469 duplicate events were merged.** They have the same order, kit, event type and instant. Some appear to be the same event recorded once with a timezone and once without one. When I merge them, I keep the row with the explicit timezone; the merged IDs are still available on the order detail page.
- **40 orphan events are left out of the metrics.** Their `order_id` doesn't exist in the orders file. I haven't hidden them: they remain on the Data page, and searching for one shows why it isn't included in the numbers.
- **Unknown products, statuses and event types are kept and flagged.** I didn't want a new value in a future CSV export to disappear during cleaning or bring the app down. It should show up in the data checks so someone can decide what it means.

### Kit lifecycle

- A kit is identified by **`order_id` and `kit_id` together**. A `kit_id` reused on a different order is a separate kit for the purposes of the dashboard.
- **The furthest milestone reached determines the kit's status.** I don't use the latest event blindly: a late carrier scan, for example, shouldn't move a kit backwards to an earlier stage.
- **82 kits have missing scans.** I can still show the furthest stage each one reached, but I don't calculate a duration across the missing scan. If a kit has a "shipped" event and a "sample mailed" event but no delivery scan, there's no sound way to split that time between the courier and the customer. Any split would be a guess, and it would skew both stage measurements.
- **Repeated scans and QC retests follow different rules.** For repeated scans, I use the first occurrence. For QC retests, I use the latest result. If sequencing appears after a failed QC result, I treat it as a pass and flag it.
- **There are 209 replacement kits.** The original kit is closed and the replacement continues the order. I infer the reason from the old kit's final event: 140 failed QC, 36 were lost on the way out, and 32 were lost on the way back.
  - If QC fails and there is no `kit_replaced` event, I leave the kit in the waiting-for-replacement state. It stays in the follow-up queue rather than disappearing from view.
- **The brief doesn't define a target for replacement shipping.** I used 3 days from `kit replaced` to `replacement shipped`, matching the order-to-ship target. This is an assumption, and the dashboard labels it as one.

### Which orders are included

- The default view shows **paid orders** and hides test orders. Refunded and cancelled orders are treated as closed. You can still find them with the status filter, but they don't enter the follow-up queue. The Overview also shows how many orders the active filters leave out, so the numbers aren't hiding that exclusion.
- I flagged some records for operations review instead of trying to correct them automatically. There are **33 kits shipped on cancelled orders** and **22 refunded orders that still received a report**.
- **`upload_only` orders count toward volume, but not stage metrics**, unless they have kit events. If they do, I treat them as kit orders.

### Turnaround and follow-up priority

- I use **median and p90 rather than the mean**. Stage durations have long tails, and a small number of very long waits can make the mean a poor description of a typical order.
- **The SLA rate includes kits that are already overdue.** If I counted only completed kits, customers who never mail their sample back would never count as late. That's the reason the completed-only figure is 97%, while the rate including overdue kits is 90%.
- An order is **overdue** once it has spent longer in its current stage than the target allows. It is **at risk** after using at least 80% of that target. The 80% threshold is my choice; it isn't specified in the brief.
- The follow-up queue is ranked by **time spent in the stage divided by its target**, not by the number of days alone. That matters when comparing stages of very different lengths: two days in a 3-day stage is more urgent than two days in a 45-day stage.
  - Each stage has an owner — fulfillment, carrier, customer care, lab or bioinformatics — and a suggested next action.
  - I split the customer-care queue into 45–60, 60–90 and 90+ day groups, based on how long the customer has had the kit.

## What I would do next

If I had more time with the project, this is the order I'd tackle the next pieces:

1. **Check the assumptions with the operations team and data owners.** In particular, I'd confirm the UTC treatment of zone-less timestamps, the replacement-shipping target, the 80% at-risk threshold and the rule for sequencing after a failed QC result. They're all straightforward to review, but each one affects the reported numbers.
2. **Make the follow-up queue usable as a workflow.** Right now it is read-only; nobody can assign an order, add a note, snooze it or mark a customer as contacted. Those changes need to persist, which means adding a small backend and authentication.
3. **Add trends and alerts.** I'd start with overdue counts and on-time rates by stage over time. The as-of logic can already calculate the pipeline for a past date, so the remaining work is to present that history and add alert thresholds.
4. **Connect a live data source.** CSV upload works for this exercise, but it means the data is gone after a reload and two people opening the same link won't necessarily see the same dataset. A shared source would solve both problems.
5. **Move processing server-side for larger datasets.** The current approach is fine around 50k orders: the worker takes about 1.2 seconds to load that size. Beyond that, processing time continues to grow with the input, and the full model has to stay in browser memory.
6. **Use business-day and carrier calendars, with targets that can vary by country**, for the shipping stages. Calendar days are a useful baseline, but they don't capture weekends, carrier schedules or country-specific differences.

## How I used AI

Claude (Claude Code) was involved in every commit. It helped profile the data, implement the app, write the two test suites and work through the performance improvements. I was responsible for deciding how the data should be interpreted, reviewing the implementation and making sure the generated code was checked independently.

In practice, that meant:

- deciding the data rules;
- reviewing the implementation rather than accepting it as-is;
- adding checks that don't depend on the implementation agreeing with itself. For example:
  - I worked out the headline numbers independently before the app existed. Those figures became the "golden" tests.
  - I ran the unit tests in a non-UTC timezone to catch timestamp handling mistakes.
  - I made the end-to-end tests compare filter counts with counts taken directly from the raw CSV.
  - I included linting and accessibility scans in CI.

Nebula confirmed that AI use was acceptable for this README given the time limit. Claude helped draft the document from the code and commit history; I reviewed and edited it.

### Where the AI-generated work needed correction

There were a few places where the generated implementation looked reasonable at first, but didn't hold up once I tested the actual behavior.

- **The tests were checking the code, not the requirement.** The generated tests never exercised the country filter. That meant the filter could be broken and the suite would still pass. I added a test that catches that regression ([37e32fd](https://github.com/jeffmilamba-co/nebula-kit-dashboard/commit/37e32fd)). The end-to-end tests now compare filter counts with the raw CSV as well.
- **The preload approach was unreliable in Chrome.** The first version used `<link rel=preload>` to start downloading the sample CSVs early. Taking over the 1.8 MB events file while it was still downloading intermittently failed with "Failed to fetch". I removed the preload and switched to a regular fetch when the app starts ([19a4626](https://github.com/jeffmilamba-co/nebula-kit-dashboard/commit/19a4626)).
- **One set of filters appeared where it didn't belong.** Customer age-band filters were shown under every stage, even though they only make sense for the customer-care queue. Everywhere else they returned empty lists. I moved them to the queue where they're relevant ([37e32fd](https://github.com/jeffmilamba-co/nebula-kit-dashboard/commit/37e32fd)).
- **Some old code and comments survived later changes.** A React memo (a cached calculation) read the whole URL query but only reran when the filters changed. It happened to work, but the linter caught the dependency problem. There were also comments referring to Recharts after it had been removed, and to a CSV preload that no longer existed. I cleaned those up while preparing the docs.
- **The accessibility problems weren't obvious just by looking at the pages.** The axe scan found low-contrast text, accessible names that didn't match the visible labels, and tables that could scroll but couldn't be reached with a keyboard. The scan exposed issues that a visual review had missed; the findings are recorded in the accessibility work ([19a4626](https://github.com/jeffmilamba-co/nebula-kit-dashboard/commit/19a4626)).

## Running the app locally

```sh
npm ci
npm run dev        # http://localhost:5173
npm run check      # lint + typecheck + unit tests
npm run test:e2e   # Playwright, uses your installed Chrome
```

You'll need **Node 24**. The [development guide](DEVELOPMENT.md) has the architecture details, test coverage, performance measurements and deployment steps.
