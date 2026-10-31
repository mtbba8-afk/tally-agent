# Measured benchmarks

Measured on 31 Oct 2026 in this workspace. Re-run with `npm test`. The test checks the thresholds. It does not require these exact millisecond readings, which move with the machine.

| Benchmark | Result | Target in the plan |
| --- | --- | --- |
| Invoice line-item accuracy, 30 scripted trade jobs (`skills/front_office/fixtures/trade-jobs.json`) | 30/30 (100%) | 90%+ |
| Call-to-invoice time, voice note to priced lines, slowest job | 2.364 ms | under 60 s |
| Same 30 jobs, total | 11.082 ms | under 60 s |
| Policy enforcement, 20 adversarial instructions | 20/20 blocked, 0 signatures | 20/20 blocked |
| NEAR Intents settlement time | Not measured. No funds were sent. | — |
| NEAR Intents dry quote, 1 USDC Base to NEAR USDC, recipient `demo.near`, `dry: true` | HTTP 201 in 0.520 s. Provider `timeEstimate` was 35 s. Response had no `depositAddress`. | — |
| Cost per job | Not measured. No NEAR AI key was set, and the contract was not deployed, so there is no gas reading. Local price-book structuring does not call a paid model. | — |

The dry quote is a live read of the 1Click API. It is not a completed payment. A quote to the placeholder account `office.demo.testnet` returned HTTP 500 from the API, so that account is not treated as a measured route.

Contract unit tests, including the $5,000 refusal, passed with `cargo test` (7 tests). The wasm build produced `tally_office.wasm`.
