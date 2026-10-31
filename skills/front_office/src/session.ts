import { assertLimitedAccessKey, buildStewardAccessKey, type FunctionCallAccessKey } from "./access-key";
import { DEMO } from "./demo-copy";
import { bookCall, type Booking } from "./front-desk";
import { mockSettle, quoteShopPayment, type ShopQuote } from "./intents";
import { priceVoiceNote, type PricedJob } from "./ledger";
import { structureVoiceNote } from "./near-ai";
import {
  compileOwnerPolicy,
  creditPayment,
  DEFAULT_POLICY,
  type Policy,
  type Treasury,
} from "./policy";
import { applyAllowedPayouts, attestSteward, reviewInstruction, type ChainSignature, type ShadeAttestation } from "./steward";

export type Env = Record<string, string | undefined>;

export type AuditEntry = {
  at: string;
  actor: "front-desk" | "ledger" | "customer" | "owner" | "steward";
  action: string;
  detail: string;
  reasons: string[];
};

export type SessionInvoice = {
  id: string;
  status: "open" | "paid";
  asset: "USDC";
  amountCents: number;
  jobRecordHash: string;
  note: string;
  normalizedNote: string;
  customerName: string | null;
  confidence: string;
  inference: "local" | "near-ai-cloud";
  pricedInMs: number;
  settlementRef: string | null;
  lines: Array<{
    code: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
  }>;
};

export type Flags = {
  intents: "mock" | "dry";
  nearAi: "local" | "near-ai-cloud";
  shadeAgent: "mock" | "tee";
  chainSignatures: "mock";
  contract: "local-policy-engine";
  realFunds: false;
};

export type AttackResult = {
  text: string;
  allowed: boolean;
  signed: boolean;
  injectionSuspected: boolean;
  reasons: string[];
  codes: string[];
};

export type Session = {
  flags: Flags;
  booking: Booking | null;
  invoice: SessionInvoice | null;
  quote: ShopQuote | null;
  policy: Policy;
  policySentence: string | null;
  treasury: Treasury;
  spentTodayCents: number;
  audit: AuditEntry[];
  signatures: ChainSignature[];
  attack: AttackResult | null;
  attestation: ShadeAttestation;
  accessKey: FunctionCallAccessKey;
  contractAccount: string;
  shopAccount: string;
  error: string | null;
};

type Clock = { now: () => string; env?: Env; fetchImpl?: typeof fetch };

export type SessionAction =
  | { action: "book"; transcript?: string }
  | { action: "price"; note?: string; trade?: "plumbing" | "hvac" | "electrical"; customerName?: string }
  | { action: "quote"; originChain?: "base" | "solana" }
  | { action: "settle" }
  | { action: "policy"; sentence?: string }
  | { action: "payout"; text?: string }
  | { action: "attack"; text?: string };

export function readFlags(env: Env = {}): Flags {
  return {
    intents: env.NEAR_INTENTS_MODE === "dry" ? "dry" : "mock",
    nearAi: env.NEAR_AI_MODE === "cloud" && env.NEAR_AI_API_KEY ? "near-ai-cloud" : "local",
    shadeAgent: env.SHADE_AGENT_MODE === "tee" && env.SHADE_AGENT_MEASUREMENT ? "tee" : "mock",
    chainSignatures: "mock",
    contract: "local-policy-engine",
    realFunds: false,
  };
}

export function initialSession(env: Env = {}): Session {
  const flags = readFlags(env);
  const accessKey = buildStewardAccessKey(DEMO.contractAccount);
  assertLimitedAccessKey(accessKey, DEMO.contractAccount);
  return {
    flags,
    booking: null,
    invoice: null,
    quote: null,
    policy: DEFAULT_POLICY,
    policySentence: null,
    treasury: { taxReserveCents: 0, ownerCents: 0, opsCents: 0 },
    spentTodayCents: 0,
    audit: [],
    signatures: [],
    attack: null,
    attestation: attestSteward(flags.shadeAgent === "tee" ? env : {}),
    accessKey,
    contractAccount: DEMO.contractAccount,
    shopAccount: DEMO.shopAccount,
    error: null,
  };
}

export async function reduceSession(state: Session, action: SessionAction, clock: Clock = { now: () => new Date().toISOString() }): Promise<Session> {
  const next: Session = { ...state, error: null, audit: [...state.audit], signatures: [...state.signatures] };
  try {
    if (action.action === "book") return book(next, action.transcript ?? DEMO.transcript, clock);
    if (action.action === "price") return await price(next, action, clock);
    if (action.action === "quote") return await quote(next, action.originChain ?? "base", clock);
    if (action.action === "settle") return settle(next, clock);
    if (action.action === "policy") return setPolicy(next, action.sentence ?? DEMO.policySentence, clock);
    if (action.action === "payout" || action.action === "attack") {
      return pay(next, action.action, action.text ?? (action.action === "attack" ? DEMO.attack : DEMO.supplierDeposit), clock);
    }
  } catch (error) {
    next.error = error instanceof Error ? error.message : "The office could not complete that step.";
  }
  return next;
}

export async function runScriptedDemo(options?: { now?: () => string; env?: Env; fetchImpl?: typeof fetch }): Promise<Session> {
  const clock: Clock = {
    now: options?.now ?? (() => new Date().toISOString()),
    env: options?.env,
    ...(options?.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };
  let state = initialSession(options?.env);
  state = await reduceSession(state, { action: "book" }, clock);
  state = await reduceSession(state, { action: "price" }, clock);
  state = await reduceSession(state, { action: "quote", originChain: "base" }, clock);
  state = await reduceSession(state, { action: "settle" }, clock);
  state = await reduceSession(state, { action: "policy" }, clock);
  state = await reduceSession(state, { action: "payout" }, clock);
  state = await reduceSession(state, { action: "attack" }, clock);
  return state;
}

export function demoTranscript(session: Session): string {
  const lines = session.invoice?.lines.map((line) => `${line.name} x${line.quantity} = $${(line.amountCents / 100).toFixed(2)}`) ?? [];
  const attackReasons = session.attack?.reasons.join(" ") ?? "";
  return [
    "Tally Front Office demo (local, no real funds)",
    session.booking?.confirmation ?? "No booking.",
    `Voice note: ${session.invoice?.note ?? ""}`,
    `Inference: ${session.invoice?.inference ?? "n/a"}`,
    ...lines,
    `Invoice ${session.invoice?.id ?? ""} ${session.invoice?.status ?? ""} $${((session.invoice?.amountCents ?? 0) / 100).toFixed(2)} ${session.invoice?.asset ?? ""}`,
    `Job record hash: ${session.invoice?.jobRecordHash ?? ""}`,
    `Intents mode: ${session.quote?.mode ?? "n/a"} dry=${String(session.quote?.dry ?? true)} depositAddress=${String(session.quote?.depositAddress ?? null)}`,
    `Settlement: ${session.invoice?.settlementRef ?? "none"}`,
    `Treasury tax $${(session.treasury.taxReserveCents / 100).toFixed(2)} owner $${(session.treasury.ownerCents / 100).toFixed(2)} ops $${(session.treasury.opsCents / 100).toFixed(2)}`,
    `Policy: ${session.policySentence ?? ""}`,
    `Steward methods: ${session.accessKey.permission.FunctionCall.method_names.join(", ")}`,
    `Shade: ${session.attestation.mode} ${session.attestation.codeHash}`,
    `Signatures: ${session.signatures.length}. Broadcast: no.`,
    `Attack signed=${String(session.attack?.signed ?? false)}`,
    attackReasons,
  ].join("\n");
}

function book(state: Session, transcript: string, clock: Clock): Session {
  const booking = bookCall(transcript);
  state.booking = booking;
  state.audit.push({
    at: clock.now(),
    actor: "front-desk",
    action: "book_call",
    detail: booking.confirmation,
    reasons: [],
  });
  return state;
}

async function price(
  state: Session,
  action: Extract<SessionAction, { action: "price" }>,
  clock: Clock,
): Promise<Session> {
  const note = action.note ?? DEMO.voiceNote;
  const started = Date.now();
  const inferred = await structureVoiceNote(note, { env: clock.env, ...(clock.fetchImpl ? { fetchImpl: clock.fetchImpl } : {}) });
  const priced: PricedJob = priceVoiceNote({
    note: inferred.normalizedNote,
    trade: action.trade ?? DEMO.trade,
    customerName: action.customerName ?? state.booking?.customerName ?? DEMO.customerName,
    inference: inferred.source,
  });
  state.invoice = {
    id: DEMO.invoiceId,
    status: "open",
    asset: "USDC",
    amountCents: priced.amountCents,
    jobRecordHash: priced.jobRecordHash,
    note,
    normalizedNote: priced.normalizedNote,
    customerName: priced.customerName,
    confidence: priced.confidence,
    inference: priced.inference,
    pricedInMs: Date.now() - started,
    settlementRef: null,
    lines: priced.lines.map((line) => ({
      code: line.code,
      name: line.name,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      amountCents: line.amountCents,
    })),
  };
  state.audit.push({
    at: clock.now(),
    actor: "ledger",
    action: "price_voice_note",
    detail: `Priced ${priced.lines.length} lines at $${(priced.amountCents / 100).toFixed(2)} from the price book. Chain stores hash ${priced.jobRecordHash}, not the note.`,
    reasons: [],
  });
  return state;
}

async function quote(state: Session, originChain: "base" | "solana", clock: Clock): Promise<Session> {
  if (!state.invoice) throw new Error("Price a voice note before requesting a payment quote.");
  state.quote = await quoteShopPayment({
    amountCents: state.invoice.amountCents,
    originChain,
    shopAccount: state.shopAccount,
    refundTo: DEMO.refundAddress,
    env: clock.env,
    ...(clock.fetchImpl ? { fetchImpl: clock.fetchImpl } : {}),
  });
  state.audit.push({
    at: clock.now(),
    actor: "customer",
    action: "intents_quote",
    detail: `Dry ${originChain} USDC quote toward ${state.shopAccount}. No deposit address. Nothing was broadcast.`,
    reasons: [],
  });
  return state;
}

function settle(state: Session, clock: Clock): Session {
  if (!state.invoice || !state.quote) throw new Error("Quote the invoice before marking it settled.");
  const settlement = mockSettle(state.quote);
  state.treasury = creditPayment(state.treasury, state.invoice.amountCents, state.policy);
  state.invoice = { ...state.invoice, status: "paid", settlementRef: settlement.settlementRef };
  state.audit.push({
    at: clock.now(),
    actor: "customer",
    action: "mark_paid",
    detail: `Mock settlement ${settlement.settlementRef}. Tax reserve, owner share, and operations share were split. Not broadcast.`,
    reasons: [],
  });
  return state;
}

function setPolicy(state: Session, sentence: string, clock: Clock): Session {
  state.policy = compileOwnerPolicy(sentence);
  state.policySentence = sentence;
  state.audit.push({
    at: clock.now(),
    actor: "owner",
    action: "set_policy",
    detail: "Owner compiled a plain-English policy. The steward access key cannot call set_policy.",
    reasons: [],
  });
  return state;
}

function pay(state: Session, kind: "payout" | "attack", text: string, clock: Clock): Session {
  const review = reviewInstruction({
    text,
    policy: state.policy,
    treasury: state.treasury,
    spentTodayCents: state.spentTodayCents,
  });
  const applied = applyAllowedPayouts(state.treasury, state.spentTodayCents, review);
  state.treasury = applied.treasury;
  state.spentTodayCents = applied.spentTodayCents;
  for (const payout of review.payouts) {
    if (payout.signature) state.signatures.push(payout.signature);
  }
  const reasons = review.payouts.flatMap((payout) => payout.decision.reasons);
  if (review.policyChangeRequested) {
    reasons.push("Policy changes are owner-only. The agent access key cannot call set_policy.");
  }
  state.audit.push({
    at: clock.now(),
    actor: "steward",
    action: review.signed ? "payout_approved" : "payout_blocked",
    detail: text,
    reasons,
  });
  if (kind === "attack" || review.injectionSuspected) {
    state.attack = {
      text,
      allowed: review.signed,
      signed: review.signed,
      injectionSuspected: review.injectionSuspected,
      reasons,
      codes: review.payouts.flatMap((payout) => payout.decision.codes),
    };
  }
  return state;
}
