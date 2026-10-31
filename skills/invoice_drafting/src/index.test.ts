import { describe, expect, it } from "vitest";
import {
  approvalDecision,
  assertSentAmountsUnchanged,
  defaultPriceBook,
  draftInvoiceFromNotes,
  EmptyJobNoteError,
  findPriceBookItem,
} from "./index";

const book = defaultPriceBook();

describe("draftInvoiceFromNotes", () => {
  it("prices a capacitor replacement and on-site hours from the price book", () => {
    const draft = draftInvoiceFromNotes({
      note: "Replaced capacitor, 2 hrs, unit 3B",
      priceBook: book,
      trade: "hvac",
      customerName: "Elena Voss",
    });

    expect(draft.confidence).toBe("high");
    expect(draft.customerName).toBe("Elena Voss");
    const capacitor = draft.lines.find((line) => line.code === "hvac.capacitor");
    const labor = draft.lines.find((line) => line.code === "hvac.labor");
    expect(capacitor).toMatchObject({ quantity: 1, unitPriceCents: 18500, amountCents: 18500 });
    expect(labor).toMatchObject({ quantity: 2, unitPriceCents: 12500, amountCents: 25000 });
    expect(draft.subtotalCents).toBe(43500);
    expect(capacitor?.description.toLowerCase()).toContain("3b");
    expect(draft.lines.every((line) => line.unitPriceCents > 0)).toBe(true);
  });

  it("uses decimal hours and stacks electrical parts", () => {
    const draft = draftInvoiceFromNotes({
      note: "Installed 3 outlets and a breaker. 1.5 hours in the kitchen.",
      priceBook: book,
      trade: "electrical",
    });

    expect(draft.lines.find((line) => line.code === "electrical.outlet")).toMatchObject({
      quantity: 3,
      amountCents: 13500,
    });
    expect(draft.lines.find((line) => line.code === "electrical.breaker")).toMatchObject({
      quantity: 1,
      amountCents: 6500,
    });
    expect(draft.lines.find((line) => line.code === "electrical.labor")).toMatchObject({
      quantity: 1.5,
      amountCents: 20250,
    });
    expect(draft.subtotalCents).toBe(13500 + 6500 + 20250);
  });

  it("keeps every clause, with unknown parts at zero until a person prices them", () => {
    const draft = draftInvoiceFromNotes({
      note: "Replaced a capacitor, a fan motor, $410 in parts and 3 hrs labor",
      priceBook: book,
      trade: "hvac",
    });

    expect(draft.lines.find((line) => line.code === "hvac.capacitor")).toMatchObject({
      quantity: 1,
      amountCents: 18500,
    });
    expect(draft.lines.find((line) => line.code === "hvac.labor")).toMatchObject({
      quantity: 3,
      amountCents: 37500,
    });
    const fan = draft.lines.find((line) => /fan motor/i.test(`${line.name} ${line.description}`));
    const parts = draft.lines.find((line) => /\$410 in parts/i.test(`${line.name} ${line.description}`));
    expect(fan).toMatchObject({ unitPriceCents: 0, amountCents: 0, quantity: 1 });
    expect(parts).toMatchObject({ unitPriceCents: 0, amountCents: 0, quantity: 1 });
    expect(fan?.code.startsWith("review.unmatched")).toBe(true);
    expect(parts?.code.startsWith("review.unmatched")).toBe(true);
    expect(fan?.code).not.toBe(parts?.code);
    expect(draft.confidence).toBe("low");
    expect(draft.subtotalCents).toBe(18500 + 37500);
    expect(draft.unmatchedPhrases.some((phrase) => /fan motor/i.test(phrase))).toBe(true);
    expect(draft.unmatchedPhrases.some((phrase) => /parts/i.test(phrase))).toBe(true);
  });

  it("turns each line of a note into its own item", () => {
    const draft = draftInvoiceFromNotes({
      note: "capacitor\nfan motor\n$410 in parts\n3 hrs labor",
      priceBook: book,
      trade: "hvac",
    });

    expect(draft.lines.map((line) => line.code)).toEqual([
      "hvac.capacitor",
      "review.unmatched",
      "review.unmatched.2",
      "hvac.labor",
    ]);
    expect(draft.lines[1]).toMatchObject({ name: "Fan motor", amountCents: 0 });
    expect(draft.lines[2]).toMatchObject({ description: "$410 in parts", amountCents: 0 });
    expect(draft.lines[3]).toMatchObject({ quantity: 3, amountCents: 37500 });
  });

  it("flags an unmatched note as low confidence and still proposes a review line", () => {
    const draft = draftInvoiceFromNotes({
      note: "Customer asked about a noise in the wall. No work performed yet.",
      priceBook: book,
      trade: "plumbing",
    });

    expect(draft.confidence).toBe("low");
    expect(draft.unmatchedPhrases.length).toBeGreaterThan(0);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]?.code).toBe("review.unmatched");
    expect(draft.subtotalCents).toBe(0);
  });

  it("refuses an empty note", () => {
    expect(() =>
      draftInvoiceFromNotes({ note: "   ", priceBook: book, trade: "hvac" }),
    ).toThrow(EmptyJobNoteError);
  });

  it("does not invent a price that is missing from the book", () => {
    const draft = draftInvoiceFromNotes({
      note: "Replaced the capacitor",
      priceBook: book.filter((item) => item.code !== "hvac.capacitor"),
      trade: "hvac",
    });
    expect(draft.lines.some((line) => line.code === "hvac.capacitor")).toBe(false);
    expect(draft.confidence).not.toBe("high");
  });

  it("keeps labor inside the requested trade", () => {
    const draft = draftInvoiceFromNotes({
      note: "2 hours clearing a drain",
      priceBook: book,
      trade: "plumbing",
    });
    expect(draft.lines.every((line) => line.code.startsWith("plumbing."))).toBe(true);
    expect(draft.lines.find((line) => line.code === "plumbing.drain")).toBeTruthy();
  });
});

describe("approvalDecision", () => {
  it("requires a person when the total is over the shop threshold", () => {
    const decision = approvalDecision({
      totalCents: 43500,
      thresholdCents: 20000,
      confidence: "high",
    });
    expect(decision.required).toBe(true);
    expect(decision.reason).toMatch(/threshold/i);
  });

  it("allows auto-send under the threshold when confidence is high", () => {
    const decision = approvalDecision({
      totalCents: 7900,
      thresholdCents: 20000,
      confidence: "high",
    });
    expect(decision.required).toBe(false);
  });

  it("requires a person when confidence is low, even under the threshold", () => {
    const decision = approvalDecision({
      totalCents: 0,
      thresholdCents: 20000,
      confidence: "low",
    });
    expect(decision.required).toBe(true);
    expect(decision.reason).toMatch(/confidence/i);
  });
});

describe("assertSentAmountsUnchanged", () => {
  const sent = draftInvoiceFromNotes({
    note: "Replaced capacitor, 2 hrs, unit 3B",
    priceBook: book,
    trade: "hvac",
  });

  it("rejects a price or quantity change after send", () => {
    const edited = {
      ...sent,
      lines: sent.lines.map((line) =>
        line.code === "hvac.labor" ? { ...line, quantity: 3, amountCents: 37500 } : line,
      ),
    };
    expect(assertSentAmountsUnchanged(sent.lines, edited.lines)).toEqual({
      ok: false,
      error: "Sent invoice amounts are locked. Create a new invoice to change a price or quantity.",
    });
  });

  it("allows an identical line list", () => {
    expect(assertSentAmountsUnchanged(sent.lines, sent.lines)).toEqual({ ok: true });
  });
});

describe("findPriceBookItem", () => {
  it("matches a keyword inside the trade", () => {
    const item = findPriceBookItem(book, "hvac", "the dual run capacitor was swollen");
    expect(item?.code).toBe("hvac.capacitor");
  });
});
