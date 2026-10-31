import { createHash } from "node:crypto";
import {
  defaultPriceBook,
  draftInvoiceFromNotes,
  type DraftLine,
  type PriceBookItem,
  type Trade,
} from "@tounkara/invoice-drafting";

export type PricedJob = {
  customerName: string | null;
  trade: Trade;
  note: string;
  normalizedNote: string;
  lines: DraftLine[];
  amountCents: number;
  asset: "USDC";
  confidence: "high" | "medium" | "low";
  jobRecordHash: string;
  inference: "local" | "near-ai-cloud";
};

export function officePriceBook(): PriceBookItem[] {
  return [
    ...defaultPriceBook(),
    { code: "plumbing.fill_valve", name: "Fill valve", trade: "plumbing", unit: "each", unitPriceCents: 4200, keywords: ["fill valve"] },
    { code: "plumbing.flapper", name: "Flapper", trade: "plumbing", unit: "each", unitPriceCents: 1800, keywords: ["flapper"] },
    { code: "plumbing.wax_ring", name: "Wax ring", trade: "plumbing", unit: "each", unitPriceCents: 900, keywords: ["wax ring"] },
    { code: "plumbing.water_heater", name: "Water heater", trade: "plumbing", unit: "each", unitPriceCents: 98000, keywords: ["water heater"] },
    { code: "plumbing.p_trap", name: "P-trap", trade: "plumbing", unit: "each", unitPriceCents: 2400, keywords: ["p-trap", "p trap"] },
    { code: "plumbing.angle_stop", name: "Angle stop", trade: "plumbing", unit: "each", unitPriceCents: 3200, keywords: ["angle stop"] },
    { code: "hvac.thermostat", name: "Thermostat", trade: "hvac", unit: "each", unitPriceCents: 8900, keywords: ["thermostat"] },
    { code: "hvac.ignitor", name: "Ignitor", trade: "hvac", unit: "each", unitPriceCents: 7600, keywords: ["ignitor", "igniter"] },
    { code: "hvac.blower", name: "Blower motor", trade: "hvac", unit: "each", unitPriceCents: 24000, keywords: ["blower motor", "blower"] },
    { code: "electrical.gfci", name: "GFCI", trade: "electrical", unit: "each", unitPriceCents: 5500, keywords: ["gfci", "gfi"] },
    { code: "electrical.switch", name: "Switch", trade: "electrical", unit: "each", unitPriceCents: 2500, keywords: ["switch"] },
    { code: "electrical.fixture", name: "Light fixture", trade: "electrical", unit: "each", unitPriceCents: 7500, keywords: ["light fixture"] },
  ];
}

export function normalizeVoiceNote(note: string): string {
  const withHours = note.replace(/(\d+(?:\.\d+)?)\s*(?:minutes|minute|mins|min)\b/gi, (_match, raw: string) => {
    const hours = Math.round((Number(raw) / 60) * 100) / 100;
    return `${hours} hours`;
  });
  return withHours.replace(/\bswitches\b/gi, "switch").replace(/(\d+(?:\.\d+)?)\s*hour\b/gi, "$1 hours");
}

export function hashJobRecord(note: string, lines: DraftLine[]): string {
  const payload = JSON.stringify({
    note,
    lines: lines.map((line) => ({
      code: line.code,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      amountCents: line.amountCents,
    })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function priceVoiceNote(input: {
  note: string;
  trade: Trade;
  customerName?: string | null;
  priceBook?: PriceBookItem[];
  inference?: "local" | "near-ai-cloud";
}): PricedJob {
  const normalizedNote = normalizeVoiceNote(input.note.trim());
  const draft = draftInvoiceFromNotes({
    note: normalizedNote,
    trade: input.trade,
    priceBook: input.priceBook ?? officePriceBook(),
    ...(input.customerName ? { customerName: input.customerName } : {}),
  });
  return {
    customerName: draft.customerName,
    trade: draft.trade,
    note: input.note.trim(),
    normalizedNote,
    lines: draft.lines,
    amountCents: draft.subtotalCents,
    asset: "USDC",
    confidence: draft.confidence,
    jobRecordHash: hashJobRecord(normalizedNote, draft.lines),
    inference: input.inference ?? "local",
  };
}
