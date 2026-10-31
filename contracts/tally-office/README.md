# tally-office

NEAR contract for Tally Front Office.

It stores invoices (id, USDC cents, status, sha256 of the job record), splits a payment into tax reserve, owner share, and operations, and answers `request_payout`. A blocked payout is written to the audit log and does not debit the tax reserve. `set_policy` is owner-only. An allowed payout returns a Chain Signatures request for `v1.signer-prod.testnet`. This crate does not broadcast that request.

```bash
cargo test --manifest-path contracts/tally-office/Cargo.toml
cargo build --manifest-path contracts/tally-office/Cargo.toml --target wasm32-unknown-unknown --release
```

The 20 adversarial cases live in `skills/front_office/fixtures/policy-cases.json` and are the same decisions the TypeScript Steward uses.

Deploy steps, and the reason this commit has no testnet account, are in the repository README.
