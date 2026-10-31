import { describe, expect, it } from "vitest";
import { readFixture } from "./fixture";
import { normalizeVoiceNote, priceVoiceNote } from "./ledger";

const jobs = readFixture<Array<{ id: string; trade: "plumbing" | "hvac" | "electrical"; note: string; codes: string[] }>>(
  "trade-jobs.json",
);

describe("priceVoiceNote", () => {
  it("prices the fill-valve voice note from the book, including 45 minutes of labor", () => {
    const priced = priceVoiceNote({
      note: "Replaced the fill valve and supply line, 45 minutes.",
      trade: "plumbing",
      customerName: "Priya",
    });
    expect(priced.inference).toBe("local");
    expect(priced.confidence).toBe("high");
    expect(priced.lines.map((line) => line.code).sort()).toEqual(
      ["plumbing.fill_valve", "plumbing.labor", "plumbing.supply"].sort(),
    );
    expect(priced.amountCents).toBe(15_625);
    expect(priced.jobRecordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(priced.lines.every((line) => line.unitPriceCents > 0)).toBe(true);
  });

  it("turns minutes into hours before the price book sees the note", () => {
    expect(normalizeVoiceNote("Replaced the fill valve, 40 minutes.")).toContain("0.67 hours");
  });

  it("matches every scripted trade job's line codes", () => {
    expect(jobs).toHaveLength(30);
    for (const job of jobs) {
      const priced = priceVoiceNote({ note: job.note, trade: job.trade });
      expect(priced.lines.map((line) => line.code).sort(), job.id).toEqual([...job.codes].sort());
      expect(priced.confidence, job.id).toBe("high");
    }
  });
});
