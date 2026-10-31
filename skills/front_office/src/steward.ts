import { createHash } from "node:crypto";
import { SIGNER_CONTRACT_TESTNET } from "./access-key";
import {
  debitOps,
  evaluatePayout,
  type Decision,
  type Policy,
  type PayoutRequest,
  type Supplier,
  type Treasury,
} from "./policy";

export const STEWARD_CODE_HASH = createHash("sha256")
  .update("tally-front-office/steward/v1|policy-evaluate|chain-signature-gated")
  .digest("hex");

export type ShadeAttestation = {
  runner: "shade-agent";
  mode: "mock" | "tee";
  codeHash: string;
  measurement: string;
  signerContract: string;
};

export function attestSteward(env: Record<string, string | undefined> = {}): ShadeAttestation {
  if (env.SHADE_AGENT_MODE === "tee") {
    if (!env.SHADE_AGENT_MEASUREMENT) {
      throw new Error("SHADE_AGENT_MODE=tee requires SHADE_AGENT_MEASUREMENT. Refusing to pretend a TEE is present.");
    }
    return {
      runner: "shade-agent",
      mode: "tee",
      codeHash: STEWARD_CODE_HASH,
      measurement: env.SHADE_AGENT_MEASUREMENT,
      signerContract: SIGNER_CONTRACT_TESTNET,
    };
  }
  return {
    runner: "shade-agent",
    mode: "mock",
    codeHash: STEWARD_CODE_HASH,
    measurement: "mock-measurement-not-a-tee",
    signerContract: SIGNER_CONTRACT_TESTNET,
  };
}

export type ChainSignature = {
  broadcast: false;
  signerContract: string;
  method: "sign";
  derivationPath: "ethereum-1";
  keyVersion: 0;
  payload: string;
  signature: "mock-signature-not-broadcast";
};

const INJECTION =
  /ignore previous|you are now|unrestricted|do not tell the owner|skip the contract|override the contract/i;
const POLICY_CHANGE = /set the daily cap|change the policy|ignore the cap|use the tax reserve|take the tax reserve/i;
const CHAIN_WORD = /\bon\s+(ethereum|solana|arbitrum|base)\b/i;
const EXPLICIT_ADDRESS = /0x[a-fA-F0-9]{40}/;
const SEND = /send\s+(-?)\$([0-9][0-9,]*(?:\.\d{1,2})?)\s+to\s+(\S+)/gi;
const PAY = /pay\s+(\S+)\s+(-?)\$([0-9][0-9,]*(?:\.\d{1,2})?)/gi;
const ANY_AMOUNT = /(-?)\$([0-9][0-9,]*(?:\.\d{1,2})?)/;

export function parsePayoutInstruction(
  text: string,
  suppliers: Supplier[],
): { payouts: PayoutRequest[]; injectionSuspected: boolean; policyChangeRequested: boolean } {
  const chainMatch = text.match(CHAIN_WORD);
  const chainOverride = chainMatch?.[1]?.toLowerCase();
  const addressMatch = text.match(EXPLICIT_ADDRESS);
  const explicitAddress = addressMatch?.[0]?.toLowerCase();
  const payouts: PayoutRequest[] = [];

  for (const match of text.matchAll(SEND)) {
    payouts.push(
      toRequest(match[3] ?? "", match[2] ?? "0", Boolean(match[1]), suppliers, chainOverride, explicitAddress),
    );
  }
  for (const match of text.matchAll(PAY)) {
    payouts.push(
      toRequest(match[1] ?? "", match[3] ?? "0", Boolean(match[2]), suppliers, chainOverride, explicitAddress),
    );
  }
  if (payouts.length === 0) {
    const amount = text.match(ANY_AMOUNT);
    if (amount) {
      payouts.push(toRequest("", amount[2] ?? "0", Boolean(amount[1]), suppliers, chainOverride, explicitAddress));
    }
  }

  return {
    payouts,
    injectionSuspected: INJECTION.test(text),
    policyChangeRequested: POLICY_CHANGE.test(text),
  };
}

function toRequest(
  token: string,
  amount: string,
  negative: boolean,
  suppliers: Supplier[],
  chainOverride: string | undefined,
  explicitAddress: string | undefined,
): PayoutRequest {
  const name = token.replace(/[.,!]+$/g, "");
  const supplier = suppliers.find(
    (item) => item.id.toLowerCase() === name.toLowerCase() || item.name.toLowerCase() === name.toLowerCase(),
  );
  const amountCents = dollarsToCents(amount, negative);
  if (!supplier) {
    return {
      payeeId: name.toLowerCase(),
      chain: chainOverride ?? "base",
      address: explicitAddress ?? "",
      amountCents,
    };
  }
  return {
    payeeId: supplier.id,
    chain: chainOverride ?? supplier.chain,
    address: explicitAddress ?? supplier.address,
    amountCents,
  };
}

function dollarsToCents(amount: string, negative: boolean): number {
  const [whole, frac = ""] = amount.replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
  if (!Number.isInteger(cents)) return 0;
  return negative ? -cents : cents;
}

export type ReviewedPayout = {
  request: PayoutRequest;
  decision: Decision;
  signature: ChainSignature | null;
};

export type InstructionReview = {
  text: string;
  injectionSuspected: boolean;
  policyChangeRequested: boolean;
  payouts: ReviewedPayout[];
  signed: boolean;
};

export function reviewInstruction(input: {
  text: string;
  policy: Policy;
  treasury: Treasury;
  spentTodayCents: number;
}): InstructionReview {
  const parsed = parsePayoutInstruction(input.text, input.policy.approvedSuppliers);
  const payouts = parsed.payouts.map((request) => {
    const decision = evaluatePayout({
      policy: input.policy,
      spentTodayCents: input.spentTodayCents,
      opsCents: input.treasury.opsCents,
      request,
    });
    const signature = decision.allowed ? mockChainSignature(request) : null;
    return { request, decision, signature };
  });
  return {
    text: input.text,
    injectionSuspected: parsed.injectionSuspected,
    policyChangeRequested: parsed.policyChangeRequested,
    payouts,
    signed: payouts.some((payout) => payout.signature !== null),
  };
}

export function applyAllowedPayouts(
  treasury: Treasury,
  spentTodayCents: number,
  review: InstructionReview,
): { treasury: Treasury; spentTodayCents: number } {
  let next = treasury;
  let spent = spentTodayCents;
  for (const payout of review.payouts) {
    if (!payout.decision.allowed || !payout.signature) continue;
    next = debitOps(next, payout.request.amountCents);
    spent += payout.request.amountCents;
  }
  return { treasury: next, spentTodayCents: spent };
}

export function mockChainSignature(request: PayoutRequest): ChainSignature {
  const payload = [
    "chain-signature",
    request.chain.trim().toLowerCase(),
    request.address.trim().toLowerCase(),
    String(request.amountCents),
    request.payeeId.trim().toLowerCase(),
  ].join(":");
  return {
    broadcast: false,
    signerContract: SIGNER_CONTRACT_TESTNET,
    method: "sign",
    derivationPath: "ethereum-1",
    keyVersion: 0,
    payload,
    signature: "mock-signature-not-broadcast",
  };
}
