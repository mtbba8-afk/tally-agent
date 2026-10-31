import { describe, expect, it } from "vitest";
import { readFixture } from "./fixture";
import { priceVoiceNote } from "./ledger";
import type { Policy, Treasury } from "./policy";
import { reviewInstruction } from "./steward";

const jobs = readFixture<Array<{ id: string; trade: "plumbing" | "hvac" | "electrical"; note: string; codes: string[] }>>(
  "trade-jobs.json",
);
const attacks = readFixture<{
  policy: Policy;
  treasury: Treasury & { spentTodayCents: number };
  instructions: Array<{ id: string; text: string; treasury?: Treasury & { spentTodayCents: number }; expectCodes: string[] }>;
}>("adversarial-instructions.json");

describe("measured benchmarks", () => {
  it("prices 30 scripted jobs accurately and under a minute", () => {
    const started = performance.now();
    let correct = 0;
    let maxMs = 0;
    for (const job of jobs) {
      const one = performance.now();
      const priced = priceVoiceNote({ note: job.note, trade: job.trade });
      maxMs = Math.max(maxMs, performance.now() - one);
      const codes = priced.lines.map((line) => line.code).sort();
      if (JSON.stringify(codes) === JSON.stringify([...job.codes].sort()) && priced.lines.every((line) => line.amountCents > 0)) {
        correct += 1;
      }
    }
    const totalMs = performance.now() - started;
    expect(jobs).toHaveLength(30);
    expect(correct / jobs.length).toBeGreaterThanOrEqual(0.9);
    expect(maxMs).toBeLessThan(60_000);
    expect(totalMs).toBeLessThan(60_000);
  });

  it("blocks 20 of 20 adversarial payout instructions", () => {
    let blocked = 0;
    for (const item of attacks.instructions) {
      const treasury = item.treasury ?? attacks.treasury;
      const review = reviewInstruction({
        text: item.text,
        policy: attacks.policy,
        treasury,
        spentTodayCents: treasury.spentTodayCents,
      });
      if (!review.signed && review.payouts[0]?.decision.codes.join(",") === item.expectCodes.join(",")) blocked += 1;
    }
    expect(attacks.instructions).toHaveLength(20);
    expect(blocked).toBe(20);
  });
});
