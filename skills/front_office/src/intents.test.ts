import { describe, expect, it } from "vitest";
import { DEMO } from "./demo-copy";
import {
  RealFundsDisabledError,
  buildQuoteRequest,
  centsToUsdcBaseUnits,
  mockSettle,
  quoteShopPayment,
} from "./intents";

describe("NEAR Intents quotes", () => {
  it("converts shop cents into USDC base units", () => {
    expect(centsToUsdcBaseUnits(15_625)).toBe("156250000");
  });

  it("builds a dry quote that pays the shop account and never asks for a deposit", () => {
    const request = buildQuoteRequest({
      amountCents: 15_625,
      originChain: "base",
      shopAccount: DEMO.shopAccount,
      refundTo: DEMO.refundAddress,
      deadline: "2026-11-14T23:59:00.000Z",
    });
    expect(request.dry).toBe(true);
    expect(request.recipient).toBe(DEMO.shopAccount);
    expect(request.destinationAsset).toContain("17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1");
    expect(request.originAsset).toContain("base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  });

  it("mocks a quote with no deposit address", async () => {
    const quote = await quoteShopPayment({
      amountCents: 15_625,
      originChain: "base",
      shopAccount: DEMO.shopAccount,
      refundTo: DEMO.refundAddress,
      env: {},
    });
    expect(quote.mode).toBe("mock");
    expect(quote.depositAddress).toBeNull();
    expect(quote.executed).toBe(false);
    expect(mockSettle(quote).broadcast).toBe(false);
  });

  it("refuses to execute a real-funds flag", async () => {
    await expect(
      quoteShopPayment({
        amountCents: 100,
        originChain: "solana",
        shopAccount: DEMO.shopAccount,
        refundTo: DEMO.refundAddress,
        env: { NEAR_INTENTS_EXECUTE: "true" },
      }),
    ).rejects.toBeInstanceOf(RealFundsDisabledError);
  });

  it("forces dry=true on the live quote path and drops nothing that looks like a deposit", async () => {
    let seen: unknown;
    const quote = await quoteShopPayment({
      amountCents: 100,
      originChain: "base",
      shopAccount: DEMO.shopAccount,
      refundTo: DEMO.refundAddress,
      env: { NEAR_INTENTS_MODE: "dry" },
      now: 1_000,
      fetchImpl: async (_url, init) => {
        seen = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ quote: { amountOut: "990000", timeEstimate: 35 } }), { status: 200 });
      },
    });
    expect(seen).toMatchObject({ dry: true });
    expect(quote.mode).toBe("dry");
    expect(quote.depositAddress).toBeNull();
    expect(quote.providerTimeEstimateSeconds).toBe(35);
    expect(quote.elapsedMs).not.toBeNull();
  });
});
