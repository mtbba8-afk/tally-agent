export type CurrencyCode = "USD";

export type InvoiceParty = {
  givenName: string;
  surname: string;
  email: string;
  businessName?: string;
};

export type InvoiceItemInput = {
  name: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
};

export type CreateInvoiceInput = {
  invoiceNumber: string;
  currency: CurrencyCode;
  note: string;
  shop: InvoiceParty & { businessName: string };
  recipient: InvoiceParty;
  items: InvoiceItemInput[];
};

export type CreateOrderInput = {
  invoiceNumber: string;
  currency: CurrencyCode;
  amountCents: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
};

export type PayPalLink = { href: string; rel: string };

export type CreatedInvoice = {
  id: string;
  status: "DRAFT";
  payUrl: string | null;
};

export type SentInvoice = {
  id: string;
  status: "SENT";
  payUrl: string | null;
};

export type CreatedOrder = {
  id: string;
  status: "CREATED";
  approveUrl: string | null;
};

export type ReminderMessage = {
  subject: string;
  note: string;
};

type Money = { currency_code: CurrencyCode; value: string };

export type PayPalInvoiceBody = {
  detail: {
    invoice_number: string;
    currency_code: CurrencyCode;
    note: string;
    payment_term: { term_type: "DUE_ON_RECEIPT" };
  };
  invoicer: {
    name: { given_name: string; surname: string };
    email_address: string;
    business_name: string;
  };
  primary_recipients: Array<{
    billing_info: {
      name: { given_name: string; surname: string };
      email_address: string;
    };
  }>;
  items: Array<{
    name: string;
    description: string;
    quantity: string;
    unit_amount: Money;
  }>;
};

export type PayPalOrderBody = {
  intent: "CAPTURE";
  purchase_units: Array<{
    reference_id: string;
    custom_id: string;
    description: string;
    amount: Money;
  }>;
  payment_source: {
    paypal: {
      experience_context: {
        return_url: string;
        cancel_url: string;
        user_action: "PAY_NOW";
        shipping_preference: "NO_SHIPPING";
      };
    };
  };
};

export type PayPalReminderBody = {
  subject: string;
  note: string;
  send_to_invoicer: false;
  send_to_recipient: true;
};

export interface PayPalGateway {
  readonly mode: "mock" | "sandbox";
  createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice>;
  sendInvoice(invoiceId: string): Promise<SentInvoice>;
  remindInvoice(invoiceId: string, message: ReminderMessage): Promise<{ reminded: true }>;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  getInvoice(invoiceId: string): Promise<{ id: string; status: string; payUrl: string | null }>;
}

export function moneyValue(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = (abs % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${dollars}.${rem}`;
}

export function buildCreateInvoiceBody(input: CreateInvoiceInput): PayPalInvoiceBody {
  return {
    detail: {
      invoice_number: input.invoiceNumber,
      currency_code: input.currency,
      note: input.note,
      payment_term: { term_type: "DUE_ON_RECEIPT" },
    },
    invoicer: {
      name: { given_name: input.shop.givenName, surname: input.shop.surname },
      email_address: input.shop.email,
      business_name: input.shop.businessName,
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: input.recipient.givenName, surname: input.recipient.surname },
          email_address: input.recipient.email,
        },
      },
    ],
    items: input.items.map((item) => ({
      name: item.name,
      description: item.description,
      quantity: String(item.quantity),
      unit_amount: { currency_code: input.currency, value: moneyValue(item.unitPriceCents) },
    })),
  };
}

export function buildCreateOrderBody(input: CreateOrderInput): PayPalOrderBody {
  return {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.invoiceNumber,
        custom_id: input.invoiceNumber,
        description: input.description,
        amount: { currency_code: input.currency, value: moneyValue(input.amountCents) },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
        },
      },
    },
  };
}

export function buildReminderBody(message: ReminderMessage): PayPalReminderBody {
  return {
    subject: message.subject,
    note: message.note,
    send_to_invoicer: false,
    send_to_recipient: true,
  };
}

export function extractInvoiceId(input: { href?: string; id?: string }): string {
  if (input.id && input.id.trim()) return input.id.trim();
  if (!input.href) return "";
  const parts = input.href.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function extractPayUrl(links: PayPalLink[]): string | null {
  for (const rel of ["payer-view", "approve"]) {
    const hit = links.find((link) => link.rel === rel);
    if (hit) return hit.href;
  }
  const hosted = links.find(
    (link) => /paypal\.com/i.test(link.href) && !/api(-m)?\.paypal\.com/i.test(link.href),
  );
  return hosted?.href ?? null;
}

type StoredInvoice = {
  number: string;
  amountCents: number;
  status: string;
  payUrl: string | null;
};

export class MockPayPalGateway implements PayPalGateway {
  readonly mode = "mock" as const;
  readonly calls: Array<{ op: string }> = [];
  private seq = 0;
  private readonly invoices = new Map<string, StoredInvoice>();

  async createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
    this.calls.push({ op: "createInvoice" });
    const id = `INV2-MOCK-${String(++this.seq).padStart(4, "0")}`;
    const amountCents = input.items.reduce(
      (sum, item) => sum + Math.round(item.quantity * item.unitPriceCents),
      0,
    );
    this.invoices.set(id, { number: input.invoiceNumber, amountCents, status: "DRAFT", payUrl: null });
    return { id, status: "DRAFT", payUrl: null };
  }

  async sendInvoice(invoiceId: string): Promise<SentInvoice> {
    this.calls.push({ op: "sendInvoice" });
    const payUrl = `https://www.sandbox.paypal.com/invoice/payerView/details/${invoiceId}`;
    const row = this.invoices.get(invoiceId);
    if (row) {
      row.status = "SENT";
      row.payUrl = payUrl;
    }
    return { id: invoiceId, status: "SENT", payUrl };
  }

  async remindInvoice(_invoiceId: string, _message: ReminderMessage): Promise<{ reminded: true }> {
    this.calls.push({ op: "remindInvoice" });
    return { reminded: true };
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    this.calls.push({ op: "createOrder" });
    const id = `ORDER-MOCK-${String(++this.seq).padStart(4, "0")}`;
    return {
      id,
      status: "CREATED",
      approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${id}&invoice=${encodeURIComponent(input.invoiceNumber)}`,
    };
  }

  async getInvoice(invoiceId: string): Promise<{ id: string; status: string; payUrl: string | null }> {
    this.calls.push({ op: "getInvoice" });
    const row = this.invoices.get(invoiceId);
    if (!row) throw new PayPalApiError(`Unknown invoice ${invoiceId}`, 404, "RESOURCE_NOT_FOUND");
    return { id: invoiceId, status: row.status, payUrl: row.payUrl };
  }

  simulatePayment(invoiceId: string, amountCents: number): {
    id: string;
    event_type: string;
    resource: Record<string, unknown>;
  } {
    const row = this.invoices.get(invoiceId);
    if (row) row.status = "PAID";
    return {
      id: `WH-MOCK-${invoiceId}`,
      event_type: "INVOICING.INVOICE.PAID",
      resource: {
        id: invoiceId,
        status: "PAID",
        invoice_number: row?.number ?? invoiceId,
        amount: { currency_code: "USD", value: moneyValue(amountCents) },
      },
    };
  }
}

export class PayPalApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(message: string, status: number, detail: string) {
    super(message);
    this.name = "PayPalApiError";
    this.status = status;
    this.detail = detail;
  }
}

export class SandboxPayPalGateway implements PayPalGateway {
  readonly mode = "sandbox" as const;
  private token: { value: string; exp: number } | null = null;

  constructor(
    private readonly options: {
      clientId: string;
      clientSecret: string;
      fetchImpl?: typeof fetch;
      baseUrl?: string;
    },
  ) {}

  async createInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
    const response = await this.request("/v2/invoicing/invoices", {
      method: "POST",
      body: buildCreateInvoiceBody(input),
    });
    const id = await readInvoiceId(response);
    return { id, status: "DRAFT", payUrl: null };
  }

  async sendInvoice(invoiceId: string): Promise<SentInvoice> {
    const response = await this.request(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`, {
      method: "POST",
      body: { send_to_recipient: true, send_to_invoicer: false },
    });
    const json = await readJson(response);
    const links = Array.isArray(json.links) ? (json.links as PayPalLink[]) : [];
    return { id: invoiceId, status: "SENT", payUrl: extractPayUrl(links) };
  }

  async remindInvoice(invoiceId: string, message: ReminderMessage): Promise<{ reminded: true }> {
    await this.request(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/remind`, {
      method: "POST",
      body: buildReminderBody(message),
    });
    return { reminded: true };
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const response = await this.request("/v2/checkout/orders", {
      method: "POST",
      body: buildCreateOrderBody(input),
    });
    const json = await readJson(response);
    const links = Array.isArray(json.links) ? (json.links as PayPalLink[]) : [];
    const id = typeof json.id === "string" ? json.id : "";
    return { id, status: "CREATED", approveUrl: extractPayUrl(links) };
  }

  async verifyWebhook(input: {
    webhookId: string;
    transmissionId: string;
    transmissionTime: string;
    transmissionSig: string;
    certUrl: string;
    authAlgo: string;
    event: unknown;
  }): Promise<boolean> {
    const response = await this.request("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: input.authAlgo,
        cert_url: input.certUrl,
        transmission_id: input.transmissionId,
        transmission_sig: input.transmissionSig,
        transmission_time: input.transmissionTime,
        webhook_id: input.webhookId,
        webhook_event: input.event,
      },
    });
    const json = await readJson(response);
    return json.verification_status === "SUCCESS";
  }

  async getInvoice(invoiceId: string): Promise<{ id: string; status: string; payUrl: string | null }> {
    const response = await this.request(`/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}`, {
      method: "GET",
    });
    const json = await readJson(response);
    const links = Array.isArray(json.links) ? (json.links as PayPalLink[]) : [];
    const status = typeof json.status === "string" ? json.status : "UNKNOWN";
    return { id: invoiceId, status, payUrl: extractPayUrl(links) };
  }

  private async request(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    const token = await this.accessToken();
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const response = await fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new PayPalApiError(`PayPal request failed (${response.status}): ${detail}`, response.status, detail);
    }
    return response;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.exp > Date.now()) return this.token.value;
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const credentials = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString("base64");
    const response = await fetchImpl(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) {
      const detail = await errorDetail(response);
      throw new PayPalApiError(`PayPal auth failed (${response.status}): ${detail}`, response.status, detail);
    }
    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new PayPalApiError("PayPal auth failed: missing token", 401, "MISSING_TOKEN");
    const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 60;
    this.token = { value: json.access_token, exp: Date.now() + Math.max(expiresIn - 30, 1) * 1000 };
    return json.access_token;
  }

  private get baseUrl(): string {
    return this.options.baseUrl ?? "https://api-m.sandbox.paypal.com";
  }
}

async function readInvoiceId(response: Response): Promise<string> {
  const location = response.headers.get("location");
  let id = location ? extractInvoiceId({ href: location }) : "";
  const text = await response.text();
  if (text) {
    try {
      const json = JSON.parse(text) as { id?: string; href?: string };
      id = extractInvoiceId(json) || id;
    } catch {
      // A 201 with an empty or non-JSON body still carries the id in Location.
    }
  }
  if (!id) throw new PayPalApiError("PayPal invoice create returned no id", 502, "MISSING_ID");
  return id;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  return JSON.parse(text) as Record<string, unknown>;
}

async function errorDetail(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `HTTP_${response.status}`;
  try {
    const json = JSON.parse(text) as { name?: string; message?: string };
    return json.name || json.message || text;
  } catch {
    return text;
  }
}

export function paypalToolkitActions(): {
  invoices: Record<string, boolean>;
  orders: Record<string, boolean>;
  disputes: Record<string, boolean>;
} {
  return {
    invoices: {
      create: true,
      list: true,
      send: true,
      sendReminder: true,
    },
    orders: {
      create: true,
      get: true,
    },
    disputes: {
      list: true,
      get: true,
    },
  };
}
