# Demo video script (about 2:30)

Mohamed records this himself. The page is `/front-office` after `npm run dev`. Badges on the page say Intents, NEAR AI, Shade Agent, and chain signatures are mock or local. Say that on camera so the demo does not pretend a mainnet payment or a TEE measurement happened.

0:00 Mohamed on camera: "I'm Mohamed, a self-taught founder in Brooklyn. Small trade shops lose jobs to missed calls and wait weeks to get paid. I built a front office that runs itself."

0:15 Phone rings. On screen, click **Book Tuesday 10:00**. The desk shows: booked Tuesday 10:00 for Priya, text confirmation ready.

0:40 Speak, or leave the filled note: "Replaced the fill valve and supply line, 45 minutes." Click **Price from the book**. The invoice shows a fill valve, a supply line, and 0.75 hour of labor, $156.25, plus the job-record hash. Say that the price came from the shop's book, not from the model, and that the chain stores the hash rather than the customer's note.

1:05 Click **Quote from Base**, then **Mark mock settlement**. Point at dry=true and deposit address null. Say a live Intents quote for 1 USDC from Base returns in about half a second and names about 35 seconds, and that this build does not take a deposit. The treasury splits: about $46.87 tax, $93.76 owner, the rest operations.

1:30 Type, or leave: "Max $200 a day, only pay Ferguson, keep 30% for taxes." Click **Compile policy**, then **Pay Ferguson $12**. The operations balance drops by $12. Say the signature is a Chain Signatures request for `v1.signer-prod.testnet` and it is not broadcast. The tax reserve does not move.

1:55 Click **Inject a $5,000 transfer**. The panel says the contract refused. The reasons are: the payee is not approved, the amount is over the daily cap, and the operations balance cannot cover it, so the tax reserve cannot be spent. The audit log shows the same text.

2:15 Cut to the numbers card from `benchmarks/RESULTS.md`: 30/30 line items, under a minute from note to invoice, 20/20 attacks blocked. "Built at NEAR HACKATHON. Repo below."

What not to claim in the cut: a funded mainnet settlement, a live TEE attestation, or a deployed testnet account. Those need Mohamed's keys and are listed in the README.
