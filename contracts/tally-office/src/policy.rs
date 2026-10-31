use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierSpec {
    pub id: String,
    pub name: String,
    pub chain: String,
    pub address: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicySpec {
    pub daily_cap_cents: i64,
    pub tax_reserve_bps: i64,
    pub owner_bps: i64,
    pub ops_bps: i64,
    pub approved_suppliers: Vec<SupplierSpec>,
}

#[derive(Clone, Debug)]
pub struct PayoutSpec<'a> {
    pub payee_id: &'a str,
    pub chain: &'a str,
    pub address: &'a str,
    pub amount_cents: i64,
}

pub fn reason_message(code: &str) -> &'static str {
    match code {
        "AMOUNT_NOT_POSITIVE" => "Amount must be greater than zero.",
        "PAYEE_NOT_APPROVED" => "Payee is not an approved supplier.",
        "CHAIN_MISMATCH" => "Destination chain does not match the approved supplier.",
        "ADDRESS_MISMATCH" => "Destination address does not match the approved supplier.",
        "OVER_DAILY_CAP" => "Amount exceeds the daily cap.",
        "INSUFFICIENT_OPS" => "Amount exceeds the agent operations balance. The tax reserve cannot be spent.",
        _ => "The payout was refused.",
    }
}

pub fn validate_policy(policy: &PolicySpec) -> Result<(), &'static str> {
    if policy.tax_reserve_bps + policy.owner_bps + policy.ops_bps != 10_000 {
        return Err("Policy shares must sum to 10000 basis points.");
    }
    if policy.daily_cap_cents < 0 || policy.tax_reserve_bps < 0 || policy.owner_bps < 0 || policy.ops_bps < 0 {
        return Err("Daily cap cannot be negative.");
    }
    for supplier in &policy.approved_suppliers {
        if supplier.id.trim().is_empty() || supplier.chain.trim().is_empty() || supplier.address.trim().is_empty() {
            return Err("Each supplier needs an id, a chain, and an address.");
        }
    }
    Ok(())
}

pub fn evaluate_payout(policy: &PolicySpec, spent_today_cents: i64, ops_cents: i64, request: PayoutSpec<'_>) -> Vec<String> {
    let mut codes = Vec::new();
    if request.amount_cents <= 0 {
        codes.push("AMOUNT_NOT_POSITIVE".to_string());
    }

    let id = request.payee_id.trim().to_lowercase();
    let supplier = policy
        .approved_suppliers
        .iter()
        .find(|item| item.id.trim().to_lowercase() == id);
    if id.is_empty() || supplier.is_none() {
        codes.push("PAYEE_NOT_APPROVED".to_string());
    } else if let Some(supplier) = supplier {
        if supplier.chain.trim().to_lowercase() != request.chain.trim().to_lowercase() {
            codes.push("CHAIN_MISMATCH".to_string());
        } else if supplier.address.trim().to_lowercase() != request.address.trim().to_lowercase() {
            codes.push("ADDRESS_MISMATCH".to_string());
        }
    }

    if request.amount_cents > 0 {
        let remaining = (policy.daily_cap_cents - spent_today_cents).max(0);
        if request.amount_cents > remaining {
            codes.push("OVER_DAILY_CAP".to_string());
        }
        if request.amount_cents > ops_cents {
            codes.push("INSUFFICIENT_OPS".to_string());
        }
    }
    codes
}

pub fn split_revenue(amount_cents: i64, tax_bps: i64, ops_bps: i64) -> (i64, i64, i64) {
    let tax = amount_cents * tax_bps / 10_000;
    let ops = amount_cents * ops_bps / 10_000;
    let owner = amount_cents - tax - ops;
    (tax, owner, ops)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TreasuryFixture {
        ops_cents: i64,
        spent_today_cents: i64,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CaseFixture {
        id: String,
        payee_id: String,
        chain: String,
        address: String,
        amount_cents: i64,
        treasury: Option<TreasuryFixture>,
        expect_codes: Vec<String>,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Fixture {
        policy: PolicySpec,
        treasury: TreasuryFixture,
        cases: Vec<CaseFixture>,
    }

    #[derive(Deserialize)]
    struct SplitFixture {
        #[serde(rename = "amountCents")]
        amount_cents: i64,
        #[serde(rename = "taxReserveBps")]
        tax_reserve_bps: i64,
        #[serde(rename = "opsBps")]
        ops_bps: i64,
        #[serde(rename = "taxReserveCents")]
        tax_reserve_cents: i64,
        #[serde(rename = "ownerCents")]
        owner_cents: i64,
        #[serde(rename = "opsCents")]
        ops_cents: i64,
    }

    #[test]
    fn reason_messages_match_the_shared_table() {
        let table: std::collections::BTreeMap<String, String> =
            serde_json::from_str(include_str!("../../../skills/front_office/fixtures/reason-codes.json")).unwrap();
        assert_eq!(table.len(), 6);
        for (code, message) in table {
            assert_eq!(reason_message(&code), message, "{code}");
        }
    }

    #[test]
    fn twenty_structured_payouts_match_the_contract_rules() {
        let fixture: Fixture =
            serde_json::from_str(include_str!("../../../skills/front_office/fixtures/policy-cases.json")).unwrap();
        assert_eq!(fixture.cases.len(), 20);
        for case in fixture.cases {
            let treasury = case.treasury.as_ref().unwrap_or(&fixture.treasury);
            let codes = evaluate_payout(
                &fixture.policy,
                treasury.spent_today_cents,
                treasury.ops_cents,
                PayoutSpec {
                    payee_id: &case.payee_id,
                    chain: &case.chain,
                    address: &case.address,
                    amount_cents: case.amount_cents,
                },
            );
            assert_eq!(codes, case.expect_codes, "{}", case.id);
            assert!(!codes.is_empty(), "{}", case.id);
        }
    }

    #[test]
    fn revenue_split_matches_the_shared_vectors() {
        let vectors: Vec<SplitFixture> =
            serde_json::from_str(include_str!("../../../skills/front_office/fixtures/split-vectors.json")).unwrap();
        for vector in vectors {
            let (tax, owner, ops) = split_revenue(vector.amount_cents, vector.tax_reserve_bps, vector.ops_bps);
            assert_eq!(tax, vector.tax_reserve_cents);
            assert_eq!(owner, vector.owner_cents);
            assert_eq!(ops, vector.ops_cents);
            assert_eq!(tax + owner + ops, vector.amount_cents);
        }
    }

    #[test]
    fn an_in_policy_supplier_payment_has_no_codes() {
        let policy = PolicySpec {
            daily_cap_cents: 20_000,
            tax_reserve_bps: 3_000,
            owner_bps: 6_000,
            ops_bps: 1_000,
            approved_suppliers: vec![SupplierSpec {
                id: "ferguson".to_string(),
                name: "Ferguson".to_string(),
                chain: "base".to_string(),
                address: "0x1111111111111111111111111111111111111111".to_string(),
            }],
        };
        let codes = evaluate_payout(
            &policy,
            0,
            5_000,
            PayoutSpec {
                payee_id: "Ferguson",
                chain: "Base",
                address: "0x1111111111111111111111111111111111111111",
                amount_cents: 1_200,
            },
        );
        assert!(codes.is_empty(), "{codes:?}");
    }
}
