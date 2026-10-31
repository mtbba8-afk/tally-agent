# Tally Voice

**From a phone call to paid, for a small HVAC shop.**

Live demo: **https://tally-tounkara.vercel.app** (open **Call**). Sample shops and customers are fictional. PayPal stays in sandbox, or in a mock gateway when keys are blank. No real money moves.

I am Mohamed Tounkara. I am a solo, self-taught, first-generation founder in Brooklyn. I sell software to small HVAC, plumbing, and electrical shops. The owner is on the tools all day and does the books at night, so the invoice goes out late and the cash sits. Tally Voice is the loop I wanted them to have: the call, the price book, their approval, and PayPal.

## The loop

1. **Answer.** Tally picks up for the shop. A live microphone, a typed line, and the recorded call all run through the same booking function. The recorded call is the reliable path when speech recognition is missing.
2. **Book.** Name, problem, address, window, and phone become a job. The assistant tool `book_service_visit` can do the same thing and open a PayPal order for the diagnostic deposit.
3. **Price.** The tech's note is matched to the shop price book. Unmatched lines stay at $0 until a person prices them. The model never invents an amount.
4. **Approve.** Over the shop threshold (default $200), or when a line missed the book, the owner gets a text on the phone screen (and via Twilio if configured). YES or the approval screen sends the invoice.
5. **Pay.** The customer gets a PayPal invoice, or an order link if no payer link comes back. The pay page explains Pay in 4 / Pay Later when the balance is in the usual band. Sandbox checkout shows the offer when the buyer qualifies.
6. **Reconcile.** PayPal webhooks mark the invoice paid, partial, viewed, or disputed. Duplicate events are ignored. If a webhook cannot reach the host, the invoice screen can replay the same event shape, and sandbox invoices can be polled.
7. **See the cash.** An AG Grid shows aging, a 7/14/30 day forecast, and who to call today.
8. **Dispute.** A dispute webhook drafts a response from the job note, the price book lines, and the call. The owner approves it before it is submitted.

## Trust rules

These are enforced in code and covered by tests:

- Draft before send. The customer does not get an invoice until the approval rule passes.
- Prices come from the price book. The model may write a sentence or parse a call. It does not set amounts.
- Sent amounts are locked.
- Every action lands in the activity log.
- The PayPal Agent Toolkit is forced onto the sandbox API. Keys stay on the server.
- With no keys, the mock gateway and the price book still run the whole loop.

## Run it

```bash
npm install
cp .env.example apps/tally/.env.local   # optional; blank values use safe fallbacks
npm test
npm run dev
```

Open http://127.0.0.1:3847/calls and play the recorded call.

To persist in Postgres, apply `supabase/migrations/20261030230000_tally_ledger.sql` in Supabase, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Calls, owner texts, and dispute packets are stored with the ledger. On Supabase they live in `paypal_events` row `tally_voice_state`, so the existing schema does not need a new migration. Without Supabase, Tally uses a local JSON file.

`render.yaml` is a Render web service for the same app. It binds `0.0.0.0:$PORT` and health-checks `/api/health`. Put the same server env vars on that service. Sandbox only.

## PayPal

- **Invoicing v2** creates and sends the invoice, including through the PayPal Agent Toolkit when a model key is present.
- **Orders v2** is the fallback when send does not return a payer link, and it is the diagnostic deposit from `book_service_visit`.
- **Webhooks** at `/api/webhooks/paypal`: `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.UPDATED`, `PAYMENT.CAPTURE.COMPLETED`, `CUSTOMER.DISPUTE.CREATED`. Set `PAYPAL_WEBHOOK_ID` before PayPal can POST.
- **Disputes v1** `provide-evidence` runs only after the owner approves a packet that has a real sandbox dispute id. Ids that start with `PP-D-DEMO` stay on the desk.
- **Pay Later** is messaging on the pay page plus the payer's sandbox checkout. Tally does not fake a Pay Later approval.

An assistant can book a visit:

```bash
curl -s https://tally-tounkara.vercel.app/api/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"book_service_visit","arguments":{"customerName":"Dana Ruiz","phone":"718-555-0148","address":"418 Bergen Street","symptom":"AC blowing warm air","windowLabel":"tomorrow morning","takeDeposit":true}}}'
```

## Reminder schedule

| Day after send | Action |
| --- | --- |
| 3 | Friendly reminder |
| 7 | Reminder, mentions Pay Later |
| 14 | Final reminder, mentions Pay Later |

A daily Vercel Cron (`0 14 * * *` UTC) calls `/api/cron/reminders`, protected by `CRON_SECRET`.

## Tests

```bash
npm test
```

48 tests, all in `skills/`.

| Module | What it covers |
| --- | --- |
| `skills/invoice_drafting` | Notes to drafts, price-book matching, approval rule, locked sent amounts |
| `skills/payment_links` | PayPal invoice and order bodies, sandbox client, mock gateway |
| `skills/payment_followups` | Day 3, 7, 14 schedule, Pay Later copy |
| `skills/reconciliation` | Paid, partial, viewed, dispute, duplicate event ids |
| `skills/voice_intake` | Recorded call, missing slots, one-utterance booking |
| `skills/cash_desk` | Aging, forecast, who to call, Pay Later band, dispute draft |

## Layout

```
apps/tally          Next.js desk, call, phone, cash grid, pay page, webhook, MCP tool
skills/             Drafting, PayPal, reminders, reconciliation, voice intake, cash desk
supabase/migrations Ledger schema
render.yaml         Render web service
```

```
call (live or recorded transcript)
  -> booked job
  -> tech note
  -> price book draft
  -> owner text or /approve/[token]
  -> PayPal invoice or order
  -> webhook
  -> cash grid
  -> dispute packet, approved by a person
```

## AI tools and how they are used

- **Cursor coding agents.** I used them to implement this hackathon loop. I reviewed the result.
- **Vercel AI SDK and AI Gateway** (`AI_GATEWAY_API_KEY`, model `AI_MODEL`, default `openai/gpt-5.4-mini`). When a key is present, the model writes the customer sentence after the price book tool returns, answers book questions, and can drive the PayPal Agent Toolkit. If the model is off or the call fails, the price book and the receptionist state machine still finish the job.
- **PayPal Agent Toolkit** (`@paypal/agent-toolkit`, sandbox). Create and send invoices. List or read sandbox disputes from the books assistant. It cannot change a unit price.
- **Browser speech recognition.** Live calls turn audio into text on the device, then the same server booking function runs. No audio is stored. The recorded transcript is the fallback and the demo path.
- **AG Grid Community.** The receivables grid (sort, filter, aging, forecast).
- **Twilio** (optional). Delivers the approval text. Without it, the text is on the owner phone screen.

The receptionist does not call a model to decide the booking. Slots are extracted in code so a judge can finish the call with the network or the model down.

## Hackathon

New work is listed by date in `HACKATHON_CHANGELOG.md`. The video script is `DEMO_SCRIPT.md`. The YouTube video is recorded from the hosted demo, not from slides.

## License

MIT. See `LICENSE`.
