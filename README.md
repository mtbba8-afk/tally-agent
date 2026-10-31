# Tally

**An invoicing and payment agent for small service shops that never acts without a person in the loop.**

Live demo: **https://tally-tounkara.vercel.app** (sample shops and customers are fictional)

Most small HVAC, plumbing and electrical shops do their invoicing at night, after the job. Invoices go out late, reminders get forgotten, and money sits unpaid. Tally takes that work off the owner's plate, but it is built so the owner stays in charge: it drafts, it explains, and it only moves money-related steps forward under rules the owner can read.

## What it does

1. **Draft.** A tech marks a job done with a plain note, like `Replaced capacitor, 2 hrs, unit 3B`. Tally turns the note into line items using the shop's own price book.
2. **Approve.** A person reviews the draft. Approval is required when the total is over the shop's threshold (default $200) or when any line did not match the price book. Unmatched lines stay at $0 until a person prices them. The AI never invents a price.
3. **Send.** Tally creates a PayPal invoice (or a PayPal order link if no payer link comes back).
4. **Remind.** Polite reminders go out on day 3, day 7 and day 14. No skipping ahead. Day 7 and day 14 mention PayPal Pay Later. Paid, void and disputed invoices are skipped.
5. **Reconcile.** PayPal webhooks mark invoices paid, partially paid, viewed or disputed. Duplicate events are ignored.
6. **Ask the books.** Plain questions like "who owes me?" or "what was paid this month?" are answered from the ledger.

## Human-in-the-loop design

Trust is the product. The rules are enforced in code and covered by tests:

- **Draft before send.** Nothing goes to a customer until the draft passes the approval rule above.
- **Prices come from the price book, not the model.** The model helps parse notes and answer questions. It does not set amounts.
- **Sent amounts are locked.** Once an invoice is sent, its amounts cannot change (`assertSentAmountsUnchanged`). Void is only possible before send.
- **Everything is logged.** Every action Tally takes lands in an activity log the owner can read.
- **Sandbox by default.** The PayPal Agent Toolkit is forced onto the sandbox API. Keys stay on the server and never use a `NEXT_PUBLIC_` prefix.
- **Works with no keys.** With no credentials, Tally runs on a mock gateway and price-book drafting, so anyone can try it safely.

## Reminder schedule

| Day after send | Action |
| --- | --- |
| 3 | Friendly reminder |
| 7 | Reminder, mentions Pay Later |
| 14 | Final reminder, mentions Pay Later |

A daily Vercel Cron (`0 14 * * *` UTC) calls `/api/cron/reminders`, protected by `CRON_SECRET`.

## PayPal flow

- **Invoicing v2** creates and sends the invoice.
- **Orders v2** is the fallback when send does not return a payer link. The order `custom_id` is the invoice number so the capture webhook can match it.
- **Webhooks** at `/api/webhooks/paypal`: `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.UPDATED`, `PAYMENT.CAPTURE.COMPLETED`, `CUSTOMER.DISPUTE.CREATED`.
- Without a webhook, **Check PayPal for payment** polls the invoice and reconciles it.

## Run it

```bash
npm install
cp .env.example apps/tally/.env.local   # optional; blank values use safe fallbacks
npm test
npm run dev
```

Open http://127.0.0.1:3847.

To persist data in Postgres, apply `supabase/migrations/20261030230000_tally_ledger.sql` in Supabase, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server only). Without them, Tally uses a local JSON file. Row level security is on and there is no browser policy.

See `.env.example` for every variable and its fallback.

## Tests

```bash
npm test
```

42 tests across 4 modules, all passing:

| Module | What it covers |
| --- | --- |
| `skills/invoice_drafting` | Notes to drafts, price-book matching, approval rule, empty notes, locked sent amounts |
| `skills/payment_links` | PayPal invoice and order bodies, sandbox client, mock gateway, full pay loop |
| `skills/payment_followups` | Day 3, 7, 14 schedule, no skipping, Pay Later copy, skipped statuses |
| `skills/reconciliation` | Paid, partial, viewed, dispute, duplicate event ids |

## Layout

```
apps/tally          Next.js desk, pay page, webhook, cron, chat
skills/             Reusable modules, each with tests
supabase/migrations Ledger schema
```

## Built with

Next.js, Vercel AI SDK and AI Gateway, PayPal Agent Toolkit (sandbox), Supabase. I built Tally with AI coding agents working under my direction and review.

## License

MIT. See `LICENSE`.
