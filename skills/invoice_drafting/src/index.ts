export type Trade = "hvac" | "plumbing" | "electrical";

export type PriceBookItem = {
  code: string;
  name: string;
  trade: Trade;
  unit: "hour" | "each" | "flat";
  unitPriceCents: number;
  keywords: string[];
};

export type DraftLine = {
  code: string;
  name: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type DraftConfidence = "high" | "medium" | "low";

export type InvoiceDraft = {
  customerName: string | null;
  jobNote: string;
  trade: Trade;
  lines: DraftLine[];
  subtotalCents: number;
  confidence: DraftConfidence;
  unmatchedPhrases: string[];
};

export type ApprovalDecision = {
  required: boolean;
  reason: string;
  thresholdCents: number;
  totalCents: number;
};

export class EmptyJobNoteError extends Error {
  constructor() {
    super("Job notes are empty. Add what was done before drafting an invoice.");
    this.name = "EmptyJobNoteError";
  }
}

const LOCK_ERROR =
  "Sent invoice amounts are locked. Create a new invoice to change a price or quantity.";

export function defaultPriceBook(): PriceBookItem[] {
  return [
    { code: "hvac.diagnostic", name: "HVAC diagnostic", trade: "hvac", unit: "flat", unitPriceCents: 8900, keywords: ["diagnostic", "service call", "came out"] },
    { code: "hvac.labor", name: "HVAC labor", trade: "hvac", unit: "hour", unitPriceCents: 12500, keywords: ["labor"] },
    { code: "hvac.capacitor", name: "Run capacitor", trade: "hvac", unit: "each", unitPriceCents: 18500, keywords: ["capacitor"] },
    { code: "hvac.contactor", name: "Contactor", trade: "hvac", unit: "each", unitPriceCents: 14500, keywords: ["contactor"] },
    { code: "hvac.filter", name: "Filter", trade: "hvac", unit: "each", unitPriceCents: 3500, keywords: ["filter"] },
    { code: "hvac.refrigerant", name: "Refrigerant", trade: "hvac", unit: "each", unitPriceCents: 8500, keywords: ["refrigerant", "freon"] },
    { code: "plumbing.diagnostic", name: "Plumbing diagnostic", trade: "plumbing", unit: "flat", unitPriceCents: 7900, keywords: ["diagnostic", "service call", "came out"] },
    { code: "plumbing.labor", name: "Plumbing labor", trade: "plumbing", unit: "hour", unitPriceCents: 11500, keywords: ["labor"] },
    { code: "plumbing.drain", name: "Drain clear", trade: "plumbing", unit: "flat", unitPriceCents: 14000, keywords: ["drain"] },
    { code: "plumbing.faucet", name: "Faucet", trade: "plumbing", unit: "each", unitPriceCents: 16500, keywords: ["faucet"] },
    { code: "plumbing.disposal", name: "Disposal", trade: "plumbing", unit: "each", unitPriceCents: 24000, keywords: ["disposal", "garbage disposal"] },
    { code: "plumbing.toilet", name: "Toilet rebuild", trade: "plumbing", unit: "each", unitPriceCents: 22000, keywords: ["toilet"] },
    { code: "plumbing.supply", name: "Supply line", trade: "plumbing", unit: "each", unitPriceCents: 2800, keywords: ["supply line", "supply"] },
    { code: "electrical.diagnostic", name: "Electrical diagnostic", trade: "electrical", unit: "flat", unitPriceCents: 9500, keywords: ["diagnostic", "service call", "came out"] },
    { code: "electrical.labor", name: "Electrical labor", trade: "electrical", unit: "hour", unitPriceCents: 13500, keywords: ["labor"] },
    { code: "electrical.outlet", name: "Outlet", trade: "electrical", unit: "each", unitPriceCents: 4500, keywords: ["outlet", "receptacle"] },
    { code: "electrical.breaker", name: "Breaker", trade: "electrical", unit: "each", unitPriceCents: 6500, keywords: ["breaker"] },
    { code: "electrical.panel", name: "Panel inspection", trade: "electrical", unit: "flat", unitPriceCents: 18000, keywords: ["panel"] },
    { code: "electrical.detector", name: "Smoke detector", trade: "electrical", unit: "each", unitPriceCents: 5500, keywords: ["smoke detector", "detector"] },
  ];
}

export function findPriceBookItem(
  priceBook: PriceBookItem[],
  trade: Trade,
  text: string,
): PriceBookItem | null {
  const haystack = text.toLowerCase();
  return (
    priceBook.find(
      (item) => item.trade === trade && item.unit !== "hour" && keywordHits(haystack, item.keywords),
    ) ?? null
  );
}

const CONTEXT_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "replaced",
  "replace",
  "installed",
  "install",
  "cleared",
  "clearing",
  "new",
  "in",
  "on",
  "at",
  "for",
  "with",
  "of",
  "to",
  "from",
  "labor",
  "labour",
  "hour",
  "hours",
  "hrs",
  "hr",
  "kitchen",
  "site",
]);

export function draftInvoiceFromNotes(input: {
  note: string;
  priceBook: PriceBookItem[];
  trade: Trade;
  customerName?: string;
}): InvoiceDraft {
  const jobNote = input.note.trim();
  if (!jobNote) throw new EmptyJobNoteError();

  const location = locationFrom(jobNote);
  const catalog = input.priceBook.filter((item) => item.trade === input.trade);
  const labor = catalog.find((item) => item.unit === "hour");
  const lines: DraftLine[] = [];
  const unmatchedPhrases: string[] = [];
  let laborAdded = false;
  let unmatchedCount = 0;

  for (const segment of noteSegments(jobNote)) {
    const haystack = segment.toLowerCase();
    const matched: PriceBookItem[] = [];
    for (const item of catalog) {
      if (item.unit === "hour") continue;
      if (!keywordHits(haystack, item.keywords)) continue;
      matched.push(item);
      const keyword = item.keywords.find((word) => keywordHits(haystack, [word])) ?? item.keywords[0] ?? item.name;
      addLine(lines, lineFrom(item, quantityBefore(haystack, keyword), location));
    }

    const hours = hoursFrom(segment);
    if (labor && hours !== null && hours > 0 && !laborAdded) {
      addLine(lines, lineFrom(labor, hours, location));
      laborAdded = true;
    }

    const covered = matched.length > 0 || (hours !== null && hours > 0 && laborAdded);
    if (!covered && !isContextOnly(segment)) {
      unmatchedCount += 1;
      unmatchedPhrases.push(segment);
      lines.push(unmatchedLine(segment, unmatchedCount));
    }
  }

  if (lines.length === 0) {
    unmatchedPhrases.push(jobNote);
    lines.push(unmatchedLine(jobNote, 1));
  }

  const needsPrice = lines.some((line) => line.code.startsWith("review.unmatched"));
  const confidence: DraftConfidence = needsPrice ? "low" : "high";

  return {
    customerName: input.customerName ?? null,
    jobNote,
    trade: input.trade,
    lines,
    subtotalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    confidence,
    unmatchedPhrases,
  };
}

export function approvalDecision(input: {
  totalCents: number;
  thresholdCents: number;
  confidence: DraftConfidence;
}): ApprovalDecision {
  if (input.confidence !== "high") {
    return {
      required: true,
      reason: "Draft confidence is too low to send without a person.",
      thresholdCents: input.thresholdCents,
      totalCents: input.totalCents,
    };
  }
  if (input.totalCents > input.thresholdCents) {
    return {
      required: true,
      reason: "Total is over the shop auto-send threshold.",
      thresholdCents: input.thresholdCents,
      totalCents: input.totalCents,
    };
  }
  return {
    required: false,
    reason: "Under the threshold with a high confidence draft.",
    thresholdCents: input.thresholdCents,
    totalCents: input.totalCents,
  };
}

export function assertSentAmountsUnchanged(
  sent: DraftLine[],
  next: DraftLine[],
): { ok: true } | { ok: false; error: string } {
  const before = fingerprint(sent);
  const after = fingerprint(next);
  if (before !== after) return { ok: false, error: LOCK_ERROR };
  return { ok: true };
}

function fingerprint(lines: DraftLine[]): string {
  return [...lines]
    .map((line) => `${line.code}|${line.quantity}|${line.unitPriceCents}|${line.amountCents}`)
    .sort()
    .join(";");
}

function noteSegments(note: string): string[] {
  const segments: string[] = [];
  for (const line of note.split(/\n+/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const clause of trimmed.split(/,|\band\b/i)) {
      const segment = clause.trim().replace(/^[.\s]+|[.\s]+$/g, "");
      if (segment) segments.push(segment);
    }
  }
  return segments;
}

function unmatchedLine(segment: string, index: number): DraftLine {
  const name = segment.charAt(0).toUpperCase() + segment.slice(1);
  return {
    code: index === 1 ? "review.unmatched" : `review.unmatched.${index}`,
    name,
    description: segment,
    quantity: 1,
    unitPriceCents: 0,
    amountCents: 0,
  };
}

function addLine(lines: DraftLine[], next: DraftLine): void {
  const existing = lines.find((line) => line.code === next.code);
  if (!existing) {
    lines.push(next);
    return;
  }
  existing.quantity += next.quantity;
  existing.amountCents = Math.round(existing.quantity * existing.unitPriceCents);
}

function isContextOnly(segment: string): boolean {
  const stripped = segment
    .replace(/\bunit\s+[a-z0-9-]+\b/gi, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:hours|hrs|hr)\b/gi, " ");
  const words = stripped
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !CONTEXT_WORDS.has(word));
  return words.length === 0;
}

function lineFrom(item: PriceBookItem, quantity: number, location: string | null): DraftLine {
  const amountCents = Math.round(quantity * item.unitPriceCents);
  const description = location ? `${item.name}. ${location}.` : item.name;
  return {
    code: item.code,
    name: item.name,
    description,
    quantity,
    unitPriceCents: item.unitPriceCents,
    amountCents,
  };
}

function keywordHits(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}s?\\b`, "i").test(haystack);
  });
}

function quantityBefore(haystack: string, keyword: string): number {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = haystack.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(?:(?:a|an|the|new|dual|run|single|double)\\s+)?${escaped}s?\\b`, "i"),
  );
  if (!match?.[1]) return 1;
  const quantity = Number(match[1]);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function hoursFrom(note: string): number | null {
  const match = note.match(/(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr)\b/i);
  if (!match?.[1]) return null;
  const hours = Number(match[1]);
  return Number.isFinite(hours) ? hours : null;
}

function locationFrom(note: string): string | null {
  const unit = note.match(/\bunit\s+([a-z0-9-]+)\b/i);
  if (unit?.[1]) return `Unit ${unit[1].toUpperCase()}`;
  return null;
}
