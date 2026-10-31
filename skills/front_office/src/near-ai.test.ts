import { describe, expect, it } from "vitest";
import { NEAR_AI_BASE_URL } from "./near-ai";
import { priceVoiceNote } from "./ledger";
import { structureVoiceNote } from "./near-ai";

describe("NEAR AI Cloud", () => {
  it("stays local when no key is set and does not call the network", async () => {
    let called = false;
    const result = await structureVoiceNote("Replaced the fill valve, 45 minutes.", {
      env: {},
      fetchImpl: async () => {
        called = true;
        return new Response("{}", { status: 500 });
      },
    });
    expect(called).toBe(false);
    expect(result.source).toBe("local");
    expect(result.normalizedNote).toContain("0.75 hours");
  });

  it("sends the note to cloud-api.near.ai and still prices from the book", async () => {
    let url = "";
    let auth = "";
    const result = await structureVoiceNote("Replaced the fill valve and supply line, 45 minutes.", {
      env: { NEAR_AI_MODE: "cloud", NEAR_AI_API_KEY: "test-key-not-a-real-secret" },
      fetchImpl: async (input, init) => {
        url = String(input);
        auth = new Headers(init?.headers).get("authorization") ?? "";
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ note: "Replaced the fill valve and supply line for $9999, 45 minutes." }) } }],
          }),
          { status: 200 },
        );
      },
    });
    expect(url).toBe(`${NEAR_AI_BASE_URL}/chat/completions`);
    expect(auth).toBe("Bearer test-key-not-a-real-secret");
    expect(result.source).toBe("near-ai-cloud");
    const priced = priceVoiceNote({ note: result.normalizedNote, trade: "plumbing", inference: result.source });
    const valve = priced.lines.find((line) => line.code === "plumbing.fill_valve");
    expect(valve?.unitPriceCents).toBe(4200);
    expect(priced.amountCents).not.toBe(999_900);
  });
});
