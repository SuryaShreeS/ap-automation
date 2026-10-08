# AP Invoice Platform

A full-stack implementation of HJ Baker's AP Invoice Processing Platform — the Blue Creek
(Vision360) replacement specified in the PRD and mocked in the Claude Design handoff. Built for
Alferix.

- **Frontend:** Next.js (App Router) + TypeScript SPA, pixel-faithful to the design prototype.
- **Backend:** Python FastAPI + PostgreSQL, seeded with the prototype's data.
- **External systems** (Sage X3, AI extraction, email intake) are stubbed behind typed service
  interfaces — clean seams for real integration later.

```
Next.js SPA  ──HTTP/JSON──▶  FastAPI  ──SQLAlchemy──▶  PostgreSQL
 (pixel-perfect UI,          (domain data +            (seeded from the
  view-models)                business logic)           design prototype)
                                   │
                                   └── stubbed seams: SageClient · ExtractionService · EmailIntake
```

## Quick start (Docker)

Requires Docker + Docker Compose.

```bash
docker compose up --build
# frontend → http://localhost:3000
# backend  → http://localhost:8000  (OpenAPI docs at /docs)
# postgres → localhost:5432
```

The backend seeds the database on first start (`SEED_ON_START=true`).

## Manual dev (no Docker)

The backend is **PostgreSQL only** — there is no SQLite fallback. Start Postgres first
(`scripts/pg-start.ps1`, or point `DATABASE_URL` at any Postgres instance); the app refuses
to start on a non-Postgres DSN.

**Backend**
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt      # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux
# DATABASE_URL comes from backend/.env (postgresql+psycopg://apuser:appass@localhost:5432/apinvoice)
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```
> Don't use `--reload` on this OneDrive-synced checkout — its file watcher lingers on the port
> and serves stale code. Restart the process manually after backend edits.

**Frontend**
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000  (expects the API at http://localhost:8000)
```

`frontend/.env.local` sets `NEXT_PUBLIC_API_BASE`.

## Local PostgreSQL (installed on this machine)

This machine has no Docker/admin, so a **portable PostgreSQL 16.6** (official EnterpriseDB
binaries) is installed under `%LOCALAPPDATA%\ap-invoice-pg` — outside the repo and OneDrive sync.
`backend/.env` already points the backend at it:

```
DATABASE_URL=postgresql+psycopg://apuser:appass@localhost:5432/apinvoice
```

Manage the server with the scripts in `scripts/` (run from PowerShell):

```powershell
./scripts/pg-start.ps1     # start on localhost:5432 (run once per boot)
./scripts/pg-stop.ps1      # stop
./scripts/pg-psql.ps1      # open a psql shell on the apinvoice DB
```

The cluster uses **trust auth on localhost** for dev convenience (the password in the URL is
accepted but not enforced). For anything beyond local dev, edit
`%LOCALAPPDATA%\ap-invoice-pg\data\pg_hba.conf` to `scram-sha-256` and set real passwords. Start
Postgres before the backend; the backend seeds the database on first startup.

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest      # business logic + API (12 tests)
cd frontend && npm run typecheck                  # strict TS type-check
```

## Layout

```
backend/
  app/
    main.py            FastAPI app (CORS, lifespan create_all + seed)
    models.py          SQLAlchemy models (full §5.4 field dictionary)
    seed.py            verbatim port of the prototype's mock data
    logic.py           pure business logic (wildcard search, variance, PO seq, totals)
    schemas.py         Pydantic request bodies
    services/          Sage / Extraction / EmailIntake seams (Protocol + mock)
    routers/           one module per screen family
  tests/               pytest (search, matching, dup-check, approvals, audit)
frontend/
  src/app/             layout (fonts), page, providers (React Query)
  src/components/       AppShell, Sidebar, Header, Box (hover/focus), Toast
  src/components/screens/   one file per page
  src/lib/             api client, css() helper, state context, tone/colour maps, constants
docker-compose.yml     Postgres + backend + frontend
```

## Pages

Branded **H.J. Baker & Bro., LLC · AP Invoice Platform (by Alferix)**. Sidebar IA:

- **Home** — pipeline, your-work cards, alerts (every count click-throughs to filtered results).
- **Invoices** — Search (Filter/Results tabs, 33 columns + Export), Detail View (split view +
  PDF source-linking, engine stepper, **‹ Back** to the previous screen), Invoice Create.
- **Dashboards** — ONE sidebar entry; Overview (All) / Aging / ERP & Cancelled / Non-PO /
  PO Only / 405-410 / Reports / Invoice Dashboard / **Analytics** are tabs inside the screen.
- **Queues** — **Inflow (Classifier)** (master queue: arrivals → rule-based classification →
  routing; below-threshold docs wait in Manual Review) and one sidebar entry per processing
  queue (**PO / Non-PO / Prepayments / Credits / Rebills**, live counts). Each queue contains
  the lifecycle **sub-queues** (All ∙ Unprocessed ∙ Data Required ∙ Auto-Matched ∙ **Awaiting
  Approval** ∙ **AP Review** ∙ Sent to ERP ∙ Paid ∙ Exceptions) — **approvals and AP Final
  Review are worked INSIDE the queue** (cards with approve/escalate/reject and
  release/send-back), and queue-specific panels embed there too (prepayment positions in
  Prepayments; settlement chain + ICEC/LEG parking in Credits/Rebills). Rows show a live
  **PIN (Sage)** column. Each queue header states its own flow.
- **Administration** — List Administration (incl. the **Routing Rules** tab: vendor/keyword
  rules + confidence threshold), User Administration, Audit Log.

## Sage integration contract

[docs/sage-integration.md](docs/sage-integration.md) documents the real Sage X3 ↔ Blue Creek
file exchange (from Symantha's samples): 12 hourly SFTP export feeds (vendor master, PO
header/lines, receipts, invoice-validation and payment-status write-backs, reference lists)
and the pipe-delimited invoice import — with field layouts and how each is replaced by a live
API call. The platform's document numbering matches the real formats: POs `P26-005942`,
vouchers `PIN######`, credits `PCM######`, payments `PAYAC/PAYWT/PAYCK######`.

## Processing engine (v2 — inflow pipeline)

`backend/app/engine.py` is the core state machine that moves a document through its lifecycle
(surfaced as the "Processing engine" stepper on Invoice Detail). Every flow starts with the
common inflow prefix — **intake → classify (rules + confidence; below the threshold it gates in
Manual Review) → route (to a processing queue) → extract (in-queue data extraction)** — then
continues per queue (`invoice.queue` selects the flow):

- **PO**: match (2/3-way via receipts) → approval gate → AP-review gate (only if a rule hits,
  else auto-skipped) → PIN → In ERP → paid (external payment feedback).
- **NONPO**: **PO-decision gate** — the processor creates the PO in Sage and attaches its number
  here (`POST /engine/attach-po`, format + uniqueness validated), or processes it as a
  **supplier BP invoice** (`POST /engine/no-po`, template-coded, never has a PO) → approval →
  onward. The vendor's last Sage PO is shown as reference only.
- **PREPAY**: bulk prepayment (e.g. "$9M · May shipments") registers/tops-up the vendor's
  prepayment (+ period PO + payment, FR-50/53); a shipment invoice runs the standard flow and
  its PIN auto-associates to the open prepayment (consumption/alerts update, FR-51/52).
- **CREDIT**: **original-PIN gate** (`POST /engine/set-original-pin` — Sage pulls the PCM lines
  from it) → always AP → PCM tied to the original PIN (chain + ICEC park, FR-60–63).
- **REBILL**: link into the settlement chain (original PIN ↔ PCM ↔ rebill, FR-62; closed-period
  rebills route for AP decision, FR-64) → match → approval → PIN completes the chain.

Gates ARE the work queues (Approvals / AP Final Review / Manual Review / stepper inputs) —
approving or releasing there **auto-continues** the engine (FR-40 honored; the continuation is
toasted). The Sage PIN write-back (`erp_voucher`) is surfaced on the queue rows and Detail —
"the PIN generated in Sage reflects back in our tool". Every step writes a `flow_step` audit
event. Endpoints: `GET /engine/flow/{inv}`, `POST /engine/step|run/{inv}`.

> **PRD divergence (from the 07/2026 client call):** FR-38 "auto-generate the next PO by
> incrementing the vendor's last PO" is **retired** — PO creation cannot be automated (manual
> order sites, IRT rail/truck imports, manual qty/price entry). The Non-PO queue's attach-PO /
> supplier-BP gate above replaces it.

## Implementation notes

- **Presentation vs. domain split.** The design prototype mixed data and styling in its
  `*Vals()` methods. Here the **backend owns business logic + domain data** (search filters,
  dashboard aggregation, matching variance & totals reconciliation, duplicate detection,
  classification/routing rules, approval limits/escalation, AP-review rules, audit logging) and the
  **frontend owns presentation** — the `css()` helper renders the prototype's inline-style
  strings verbatim, `Box` reproduces `style-hover`/`style-focus`, and view-models are assembled
  from API responses. This keeps the UI pixel-identical to the mockup.
- **PostgreSQL only (no fallback).** The app requires a Postgres DSN and refuses to start
  otherwise. Sync SQLAlchemy 2.0 over `psycopg` — chosen over async for this CRUD-heavy app
  (simpler, robust); FastAPI runs sync endpoints in its threadpool. Tests run against a dedicated
  `apinvoice_test` Postgres database, created automatically.
- **Fonts** (Sora / Manrope / JetBrains Mono) load via a Google Fonts `<link>` in the root
  layout so the literal family names in the ported style strings resolve exactly. To go
  self-hosted/offline later, switch to `next/font` and swap the family names for CSS variables.
- **`alert()` → toasts.** The prototype's demo `alert()` affordances (Export to Excel, Update
  Vendor, Sage release messages, engine step results) surface as toasts.
- **Auth is scaffolded, not wired.** Roles/limits come from the PRD; the current user is read
  from an `X-User` header (MVP). SSO (Entra ID) is a documented seam.

## Troubleshooting

- **Page loads but nothing is clickable (can't navigate).** The client JS chunks 404 and React
  never hydrates. Almost always caused by running `next build` against a **live** `next dev`
  server — the production build overwrites the dev server's `.next` directory. Fix: stop the dev
  server, `rm -rf frontend/.next`, and `npm run dev` again. Don't run `build` and `dev` at the
  same time in the same working copy.

The original design handoff is kept under `_handoff/` for reference (git-ignored).
