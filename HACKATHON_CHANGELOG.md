# Hackathon changelog

PayPal AI Hackathon. Work below is new during the hackathon window. The invoicing desk that existed before this (drafts, approval rules, PayPal sandbox invoices, reminders, webhooks) is the base. These entries are the voice-to-paid loop.

## 2026-10-31

- Added a voice intake path for an HVAC shop. A live browser call, a typed line, and a recorded call transcript all book through the same slot function. The recorded call is the fallback when a microphone is unavailable.
- A booked visit takes a technician note and prices it from the shop price book. The model does not set amounts.
- The owner approves by the on-screen phone or by `/approve/[token]`. YES sends the PayPal invoice. Optional Twilio delivery when those env vars are set.
- Pay page states Pay in 4 / Pay Later when the balance is in the usual band. Checkout stays on PayPal sandbox or the mock gateway.
- PayPal paid and dispute webhooks still reconcile the ledger. The invoice screen can replay those same event shapes when a sandbox webhook cannot reach the host.
- AG Grid cash desk: aging, a 7/14/30 day collection forecast, and who to call today.
- Dispute response packets are drafted from the job note, the price book lines, and the call. A person approves before submit. Demo dispute ids stay on the desk. A real sandbox dispute id is sent with the PayPal evidence API.
- `POST /api/mcp` exposes `book_service_visit`, including an optional diagnostic deposit order.
- `render.yaml` is the Render web service blueprint. The Next app binds `0.0.0.0:$PORT`.
