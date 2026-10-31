import { readFixture } from "./fixture";

export type Supplier = {
  id: string;
  name: string;
  chain: string;
  address: string;
};

export type Policy = {
  dailyCapCents: number;
  taxReserveBps: number;
  ownerBps: number;
  opsBps: number;
  approvedSuppliers: Supplier[];
};

export type Treasury = {
  taxReserveCents: number;
  ownerCents: number;
  opsCents: number;
};

export type PayoutRequest = {
  payeeId: string;
  chain: string;
  address: string;
  amountCents: number;
};

export type ReasonCode =
  | "AMOUNT_NOT_POSITIVE"
  | "PAYEE_NOT_APPROVED"
  | "CHAIN_MISMATCH"
  | "ADDRESS_MISMATCH"
  | "OVER_DAILY_CAP"
  | "INSUFFICIENT_OPS";

export type Decision = {
  allowed: boolean;
  codes: ReasonCode[];
  reasons: string[];
};

const REASON_MESSAGES = readFixture<Record<ReasonCode, string>>("reason-codes.json");

export const DEFAULT_POLICY: Policy = {
  dailyCapCents: 20_000,
  taxReserveBps: 3_000,
  ownerBps: 6_000,
  opsBps: 1_000,
  approvedSuppliers: [],
};

export function reasonMessage(code: string): string {
  return REASON_MESSAGES[code as ReasonCode] ?? "The payout was refused.";
}

export function assertPolicyShape(policy: Policy): void {
  const sum = policy.taxReserveBps + policy.ownerBps + policy.opsBps;
  if (sum !== 10_000) {
    throw new Error("Policy shares must sum to 10000 basis points.");
  }
  if (!Number.isInteger(policy.dailyCapCents) || policy.dailyCapCents < 0) {
    throw new Error("Daily cap cannot be negative.");
  }
  for (const share of [policy.taxReserveBps, policy.ownerBps, policy.opsBps]) {
    if (!Number.isInteger(share) || share < 0) {
      throw new Error("Policy shares must be whole basis points.");
    }
  }
  for (const supplier of policy.approvedSuppliers) {
    if (!supplier.id.trim() || !supplier.chain.trim() || !supplier.address.trim()) {
      throw new Error("Each supplier needs an id, a chain, and an address.");
    }
  }
}

export function evaluatePayout(input: {
  policy: Policy;
  spentTodayCents: number;
  opsCents: number;
  request: PayoutRequest;
}): Decision {
  const codes: ReasonCode[] = [];
  const amount = input.request.amountCents;
  if (!Number.isInteger(amount) || amount <= 0) {
    codes.push("AMOUNT_NOT_POSITIVE");
  }

  const id = input.request.payeeId.trim().toLowerCase();
  const supplier = input.policy.approvedSuppliers.find((item) => item.id.trim().toLowerCase() === id);
  if (!id || !supplier) {
    codes.push("PAYEE_NOT_APPROVED");
  } else if (supplier.chain.trim().toLowerCase() !== input.request.chain.trim().toLowerCase()) {
    codes.push("CHAIN_MISMATCH");
  } else if (supplier.address.trim().toLowerCase() !== input.request.address.trim().toLowerCase()) {
    codes.push("ADDRESS_MISMATCH");
  }

  if (amount > 0) {
    const remaining = Math.max(0, input.policy.dailyCapCents - input.spentTodayCents);
    if (amount > remaining) codes.push("OVER_DAILY_CAP");
    if (amount > input.opsCents) codes.push("INSUFFICIENT_OPS");
  }

  return {
    allowed: codes.length === 0,
    codes,
    reasons: codes.map((code) => reasonMessage(code)),
  };
}

export function splitRevenue(
  amountCents: number,
  policy: Pick<Policy, "taxReserveBps" | "ownerBps" | "opsBps">,
): { taxReserveCents: number; ownerCents: number; opsCents: number } {
  const taxReserveCents = Math.floor((amountCents * policy.taxReserveBps) / 10_000);
  const opsCents = Math.floor((amountCents * policy.opsBps) / 10_000);
  const ownerCents = amountCents - taxReserveCents - opsCents;
  return { taxReserveCents, ownerCents, opsCents };
}

export function creditPayment(treasury: Treasury, amountCents: number, policy: Policy): Treasury {
  const split = splitRevenue(amountCents, policy);
  return {
    taxReserveCents: treasury.taxReserveCents + split.taxReserveCents,
    ownerCents: treasury.ownerCents + split.ownerCents,
    opsCents: treasury.opsCents + split.opsCents,
  };
}

export function debitOps(treasury: Treasury, amountCents: number): Treasury {
  return { ...treasury, opsCents: treasury.opsCents - amountCents };
}

export const DEMO_SUPPLIERS: Supplier[] = [
  {
    id: "ferguson",
    name: "Ferguson",
    chain: "base",
    address: "0x1111111111111111111111111111111111111111",
  },
];

export function compileOwnerPolicy(sentence: string, directory: Supplier[] = DEMO_SUPPLIERS): Policy {
  const capMatch = sentence.match(/\$\s*([0-9][0-9,]*)/);
  if (!capMatch?.[1]) {
    throw new Error("Say the daily maximum in dollars, for example $200.");
  }
  const dollars = Number(capMatch[1].replace(/,/g, ""));
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error("Daily cap is not a dollar amount.");
  }

  const taxMatch = sentence.match(/(\d+(?:\.\d+)?)\s*%\s*(?:for taxes|tax)/i);
  if (!taxMatch?.[1]) {
    throw new Error("Say the tax reserve percent, for example 30% for taxes.");
  }
  const taxReserveBps = Math.round(Number(taxMatch[1]) * 100);
  const opsBps = 1_000;
  const ownerBps = 10_000 - taxReserveBps - opsBps;
  if (taxReserveBps < 0 || ownerBps < 0) {
    throw new Error("Tax reserve must leave room for the owner and the 10% operations share.");
  }

  const only = sentence.match(/only pay\s+([A-Za-z0-9][A-Za-z0-9 .'-]*)/i);
  if (!only?.[1]) {
    throw new Error("Name the supplier, for example only pay Ferguson.");
  }
  const name = only[1].trim().replace(/[.,]$/, "");
  const supplier = directory.find(
    (item) => item.name.toLowerCase() === name.toLowerCase() || item.id.toLowerCase() === name.toLowerCase(),
  );
  if (!supplier) {
    throw new Error(`${name} is not in the supplier directory. Add their chain and address before they can be paid.`);
  }

  const policy: Policy = {
    dailyCapCents: Math.round(dollars * 100),
    taxReserveBps,
    ownerBps,
    opsBps,
    approvedSuppliers: [supplier],
  };
  assertPolicyShape(policy);
  return policy;
}
