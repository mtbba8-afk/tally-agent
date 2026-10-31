# Submission draft

Not submitted. One shot, after Mohamed says yes. Keep the request id if the form is retried.

| Field | Value |
| --- | --- |
| Project name | Tally Front Office |
| Lead | Mohamed Tounkara |
| Email | (Mohamed fills this) |
| Team size | 1 |
| Tracks | `business`, `realworld`, `agents`, `security` |
| Mainnet NEAR payout account | (Mohamed creates this himself. Receive-only. The seed phrase never goes in chat, email, the repo, or this file.) |
| Repo URL | (public GitHub URL of this repo) |
| Demo URL | (hosted demo, kept up through 25 Nov 2026. Local run is `npm run dev` then `/front-office`.) |
| Consent | (Mohamed reads the form's consent sentence himself) |

## Idea text

Tally Front Office is the front office for a one-person trade shop. It books the job from the call, turns the technician's voice note into a priced invoice from the shop's own price book, and quotes a NEAR Intents payment so USDC from Base or Solana can settle to one shop account. A Steward pays a supplier through a Chain Signatures request, and only inside an on-chain policy the owner writes in plain English: a daily cap, an approved supplier, and a tax reserve. The agent's key is a function-call access key for that contract. It cannot change the policy or sign an EVM transfer on its own. A prompt that says to send $5,000 somewhere else is refused by the contract, and the audit log stores the reason. The contract stores a hash of the job, not the customer's note. Private inference uses NEAR AI Cloud when a key is present. This build runs the same rules locally, with Intents dry or mocked, because Intents has no testnet and this environment has no funded account.

## Other project

This repository is the only NEAR Hackathon submission from this codebase. The PayPal invoicing desk in the same repo is the pre-hackathon baseline, tagged `pre-hackathon`. It is not a second entry.
