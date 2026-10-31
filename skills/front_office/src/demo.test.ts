import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoTranscript, runScriptedDemo } from "./session";

describe("scripted front office demo", () => {
  it("books the call, prices the note, mocks Intents, pays Ferguson, and refuses $5,000", async () => {
    const session = await runScriptedDemo({ now: () => "2026-11-01T15:00:00.000Z", env: {} });
    expect(session.error).toBeNull();
    expect(session.booking?.when).toBe("Tuesday 10:00");
    expect(session.booking?.customerName).toBe("Priya");
    expect(session.invoice?.status).toBe("paid");
    expect(session.invoice?.amountCents).toBe(15_625);
    expect(session.invoice?.lines.map((line) => line.code).sort()).toEqual(
      ["plumbing.fill_valve", "plumbing.labor", "plumbing.supply"].sort(),
    );
    expect(session.quote?.dry).toBe(true);
    expect(session.quote?.depositAddress).toBeNull();
    expect(session.quote?.executed).toBe(false);
    expect(session.invoice?.settlementRef).toBe("mock-settlement-not-broadcast");
    expect(session.treasury.taxReserveCents).toBe(4_687);
    expect(session.treasury.ownerCents).toBe(9_376);
    expect(session.treasury.opsCents).toBe(362);
    expect(session.signatures).toHaveLength(1);
    expect(session.signatures[0]?.broadcast).toBe(false);
    expect(session.attack?.signed).toBe(false);
    expect(session.attack?.injectionSuspected).toBe(true);
    expect(session.attack?.codes).toEqual(["PAYEE_NOT_APPROVED", "OVER_DAILY_CAP", "INSUFFICIENT_OPS"]);
    expect(session.accessKey.permission.FunctionCall.method_names).not.toContain("set_policy");
    expect(session.attestation.mode).toBe("mock");
    expect(session.flags.realFunds).toBe(false);

    const transcript = demoTranscript(session);
    expect(transcript).toContain("Payee is not an approved supplier.");
    expect(transcript).toContain("mock-settlement-not-broadcast");
    const file = join(dirname(fileURLToPath(import.meta.url)), "../../../benchmarks/demo-transcript.txt");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${transcript}\n`);
  });
});
