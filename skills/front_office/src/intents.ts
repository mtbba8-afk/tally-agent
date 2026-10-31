export const INTENTS_QUOTE_URL = "https://1click.chaindefuser.com/v0/quote";
export const INTENTS_STATUS_URL = "https://1click.chaindefuser.com/v0/status";

export const INTENTS_ASSETS = {
  baseUsdc: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  solUsdc: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  nearUsdc: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
} as const;

export type OriginChain = "base" | "solana";

export class RealFundsDisabledError extends Error {
  constructor() {
    super(
      "NEAR Intents has no testnet. This build will not broadcast a deposit or move mainnet funds. Leave NEAR_INTENTS_EXECUTE unset and use mock or dry mode.",
    );
    this.name = "RealFundsDisabledError";
  }
}

export type QuoteRequestBody = {
  dry: true;
  swapType: "EXACT_INPUT";
  slippageTolerance: number;
  originAsset: string;
  depositType: "ORIGIN_CHAIN";
  destinationAsset: string;
  amount: string;
  recipient: string;
  recipientType: "DESTINATION_CHAIN";
  refundTo: string;
  refundType: "ORIGIN_CHAIN";
  deadline: string;
};

export type ShopQuote = {
  mode: "mock" | "dry";
  dry: true;
  executed: false;
  depositAddress: null;
  originChain: OriginChain;
  amountIn: string;
  amountOut: string | null;
  shopAccount: string;
  assetOut: "USDC";
  providerTimeEstimateSeconds: number | null;
  elapsedMs: number | null;
  request: QuoteRequestBody;
};

export function centsToUsdcBaseUnits(cents: number): string {
  if (!Number.isInteger(cents) || cents <= 0) {
    throw new Error("Amount must be a positive integer number of cents.");
  }
  return String(cents * 10_000);
}

export function buildQuoteRequest(input: {
  amountCents: number;
  originChain: OriginChain;
  shopAccount: string;
  refundTo: string;
  deadline?: string;
}): QuoteRequestBody {
  return {
    dry: true,
    swapType: "EXACT_INPUT",
    slippageTolerance: 100,
    originAsset: input.originChain === "solana" ? INTENTS_ASSETS.solUsdc : INTENTS_ASSETS.baseUsdc,
    depositType: "ORIGIN_CHAIN",
    destinationAsset: INTENTS_ASSETS.nearUsdc,
    amount: centsToUsdcBaseUnits(input.amountCents),
    recipient: input.shopAccount,
    recipientType: "DESTINATION_CHAIN",
    refundTo: input.refundTo,
    refundType: "ORIGIN_CHAIN",
    deadline: input.deadline ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export function assertNoRealFunds(env: Record<string, string | undefined>): void {
  if (env.NEAR_INTENTS_EXECUTE === "true") {
    throw new RealFundsDisabledError();
  }
}

export async function quoteShopPayment(input: {
  amountCents: number;
  originChain: OriginChain;
  shopAccount: string;
  refundTo: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: number;
}): Promise<ShopQuote> {
  const env = input.env ?? {};
  assertNoRealFunds(env);
  const request = buildQuoteRequest(input);
  if (request.dry !== true) {
    throw new RealFundsDisabledError();
  }
  const mode = env.NEAR_INTENTS_MODE === "dry" ? "dry" : "mock";
  if (mode === "mock") {
    return {
      mode,
      dry: true,
      executed: false,
      depositAddress: null,
      originChain: input.originChain,
      amountIn: request.amount,
      amountOut: request.amount,
      shopAccount: input.shopAccount,
      assetOut: "USDC",
      providerTimeEstimateSeconds: null,
      elapsedMs: null,
      request,
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const started = input.now ?? Date.now();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (env.NEAR_INTENTS_JWT) headers.Authorization = `Bearer ${env.NEAR_INTENTS_JWT}`;
  const response = await fetchImpl(INTENTS_QUOTE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`NEAR Intents dry quote failed with HTTP ${response.status}. No funds were sent.`);
  }
  const body = (await response.json()) as {
    quote?: { amountOut?: string; timeEstimate?: number };
    depositAddress?: string;
  };
  if (body.depositAddress) {
    throw new Error("Dry quote returned a deposit address. Refusing to surface it.");
  }
  return {
    mode,
    dry: true,
    executed: false,
    depositAddress: null,
    originChain: input.originChain,
    amountIn: request.amount,
    amountOut: body.quote?.amountOut ?? null,
    shopAccount: input.shopAccount,
    assetOut: "USDC",
    providerTimeEstimateSeconds: body.quote?.timeEstimate ?? null,
    elapsedMs: Date.now() - started,
    request,
  };
}

export function mockSettle(quote: ShopQuote): { broadcast: false; settlementRef: string } {
  if (quote.mode !== "mock" || quote.dry !== true || quote.depositAddress !== null) {
    throw new Error("Only a mock dry quote can be marked settled here, and it is not broadcast.");
  }
  return { broadcast: false, settlementRef: "mock-settlement-not-broadcast" };
}
