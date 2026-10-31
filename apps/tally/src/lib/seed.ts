import type { AgentLogEntry, Customer, Invoice, Job, LedgerData, Shop } from "./types";

const DAY = 86_400_000;

function isoDaysAgo(now: Date, days: number, hours = 15): string {
  const copy = new Date(now.getTime() - days * DAY);
  copy.setUTCHours(hours, 0, 0, 0);
  return copy.toISOString();
}

export function buildSeed(now = new Date()): LedgerData {
  const shops: Shop[] = [
    {
      id: "shop_northline",
      name: "Northline Mechanical",
      trade: "hvac",
      city: "Queens",
      ownerGivenName: "Marisol",
      ownerSurname: "Vega",
      email: "billing@northline.example",
      autoSendThresholdCents: 20000,
      simulatedNow: null,
    },
    {
      id: "shop_harborline",
      name: "Harborline Plumbing",
      trade: "plumbing",
      city: "Jersey City",
      ownerGivenName: "Andre",
      ownerSurname: "Pell",
      email: "billing@harborline.example",
      autoSendThresholdCents: 20000,
      simulatedNow: null,
    },
    {
      id: "shop_switchback",
      name: "Switchback Electric",
      trade: "electrical",
      city: "Brooklyn",
      ownerGivenName: "Chris",
      ownerSurname: "Okonkwo",
      email: "billing@switchback.example",
      autoSendThresholdCents: 20000,
      simulatedNow: null,
    },
  ];

  const roster: Array<[string, string, string]> = [
    ["shop_northline", "Elena Voss", "elena.voss@example.com"],
    ["shop_northline", "Noah Patel", "noah.patel@example.com"],
    ["shop_northline", "Priya Shah", "priya.shah@example.com"],
    ["shop_northline", "Luis Ortega", "luis.ortega@example.com"],
    ["shop_northline", "Hannah Brooks", "hannah.brooks@example.com"],
    ["shop_northline", "Owen Clarke", "owen.clarke@example.com"],
    ["shop_northline", "Maya Chen", "maya.chen@example.com"],
    ["shop_harborline", "Sam Ibarra", "sam.ibarra@example.com"],
    ["shop_harborline", "Jordan Hale", "jordan.hale@example.com"],
    ["shop_harborline", "Riley Nguyen", "riley.nguyen@example.com"],
    ["shop_harborline", "Avery Cole", "avery.cole@example.com"],
    ["shop_harborline", "Quinn Adler", "quinn.adler@example.com"],
    ["shop_harborline", "Rowan Blake", "rowan.blake@example.com"],
    ["shop_harborline", "Sage Romero", "sage.romero@example.com"],
    ["shop_switchback", "Parker Diaz", "parker.diaz@example.com"],
    ["shop_switchback", "Reese Morgan", "reese.morgan@example.com"],
    ["shop_switchback", "Finley Grant", "finley.grant@example.com"],
    ["shop_switchback", "Harper Singh", "harper.singh@example.com"],
    ["shop_switchback", "Drew Alvarez", "drew.alvarez@example.com"],
    ["shop_switchback", "Casey Brennan", "casey.brennan@example.com"],
  ];

  const customers: Customer[] = roster.map(([shopId, name, email], index) => ({
    id: `cus_${String(index + 1).padStart(2, "0")}`,
    shopId,
    name,
    email,
    phone: `555-01${String(index + 10).padStart(2, "0")}`,
  }));

  const byName = (name: string) => {
    const customer = customers.find((item) => item.name === name);
    if (!customer) throw new Error(`Missing sample customer ${name}`);
    return customer;
  };

  const jobs: Job[] = [
    job("job_1001", byName("Elena Voss"), "Replaced capacitor, 2 hrs, unit 3B", isoDaysAgo(now, 4)),
    job("job_1002", byName("Noah Patel"), "Diagnostic and a new filter. 1 hour.", isoDaysAgo(now, 9)),
    job("job_1003", byName("Priya Shah"), "Replaced contactor, 1.5 hrs, unit 2A", isoDaysAgo(now, 0, 18)),
    job("job_1004", byName("Sam Ibarra"), "Cleared a kitchen drain. 1 hour.", isoDaysAgo(now, 10)),
    job("job_1005", byName("Jordan Hale"), "Rebuilt the toilet and replaced the supply line.", isoDaysAgo(now, 20)),
    job("job_1006", byName("Parker Diaz"), "Installed 3 outlets and a breaker. 1.5 hours in the kitchen.", isoDaysAgo(now, 16)),
    job("job_1007", byName("Reese Morgan"), "Panel inspection, 1 hour.", isoDaysAgo(now, 2)),
  ];

  const invoices: Invoice[] = [
    invoice({
      id: "inv_1001",
      number: "INV-1001",
      job: jobs[0]!,
      customer: byName("Elena Voss"),
      status: "sent",
      lines: [
        line("hvac.capacitor", "Run capacitor", "Run capacitor. Unit 3B.", 1, 18500),
        line("hvac.labor", "HVAC labor", "HVAC labor. Unit 3B.", 2, 12500),
      ],
      confidence: "high",
      customerNote: "Replaced the run capacitor on unit 3B and spent 2 hours on site.",
      sentAt: isoDaysAgo(now, 4),
      remindersSent: [],
    }),
    invoice({
      id: "inv_1002",
      number: "INV-1002",
      job: jobs[1]!,
      customer: byName("Noah Patel"),
      status: "paid",
      lines: [
        line("hvac.diagnostic", "HVAC diagnostic", "HVAC diagnostic.", 1, 8900),
        line("hvac.filter", "Filter", "Filter.", 1, 3500),
        line("hvac.labor", "HVAC labor", "HVAC labor.", 1, 12500),
      ],
      confidence: "high",
      customerNote: "Diagnostic, a new filter, and an hour on site.",
      sentAt: isoDaysAgo(now, 9),
      paidAt: isoDaysAgo(now, 8),
      paidCents: 24900,
      remindersSent: [3],
    }),
    invoice({
      id: "inv_1003",
      number: "INV-1003",
      job: jobs[2]!,
      customer: byName("Priya Shah"),
      status: "awaiting_approval",
      lines: [
        line("hvac.contactor", "Contactor", "Contactor. Unit 2A.", 1, 14500),
        line("hvac.labor", "HVAC labor", "HVAC labor. Unit 2A.", 1.5, 12500),
      ],
      confidence: "high",
      customerNote: "Replaced the contactor on unit 2A. Labor is 1.5 hours.",
      remindersSent: [],
    }),
    invoice({
      id: "inv_1004",
      number: "INV-1004",
      job: jobs[3]!,
      customer: byName("Sam Ibarra"),
      status: "sent",
      lines: [
        line("plumbing.drain", "Drain clear", "Drain clear.", 1, 14000),
        line("plumbing.labor", "Plumbing labor", "Plumbing labor.", 1, 11500),
      ],
      confidence: "high",
      customerNote: "Cleared the kitchen drain and spent an hour on site.",
      sentAt: isoDaysAgo(now, 10),
      remindersSent: [3],
    }),
    invoice({
      id: "inv_1005",
      number: "INV-1005",
      job: jobs[4]!,
      customer: byName("Jordan Hale"),
      status: "partial",
      lines: [
        line("plumbing.toilet", "Toilet rebuild", "Toilet rebuild.", 1, 22000),
        line("plumbing.supply", "Supply line", "Supply line.", 1, 2800),
      ],
      confidence: "high",
      customerNote: "Rebuilt the toilet and replaced the supply line.",
      sentAt: isoDaysAgo(now, 20),
      paidCents: 10000,
      remindersSent: [3, 7],
    }),
    invoice({
      id: "inv_1006",
      number: "INV-1006",
      job: jobs[5]!,
      customer: byName("Parker Diaz"),
      status: "viewed",
      lines: [
        line("electrical.outlet", "Outlet", "Outlet.", 3, 4500),
        line("electrical.breaker", "Breaker", "Breaker.", 1, 6500),
        line("electrical.labor", "Electrical labor", "Electrical labor.", 1.5, 13500),
      ],
      confidence: "high",
      customerNote: "Installed 3 outlets and a breaker. Labor is 1.5 hours.",
      sentAt: isoDaysAgo(now, 16),
      remindersSent: [3, 7],
    }),
    invoice({
      id: "inv_1007",
      number: "INV-1007",
      job: jobs[6]!,
      customer: byName("Reese Morgan"),
      status: "paid",
      lines: [
        line("electrical.panel", "Panel inspection", "Panel inspection.", 1, 18000),
        line("electrical.labor", "Electrical labor", "Electrical labor.", 1, 13500),
      ],
      confidence: "high",
      customerNote: "Panel inspection and an hour of labor.",
      sentAt: isoDaysAgo(now, 3),
      paidAt: isoDaysAgo(now, 2),
      paidCents: 31500,
      remindersSent: [],
    }),
  ];

  const logs: AgentLogEntry[] = [
    log("log_01", "shop_northline", isoDaysAgo(now, 4), "agent", "draft_created", "Drafted INV-1001 from the job note and the HVAC price book.", "inv_1001", "job_1001"),
    log("log_02", "shop_northline", isoDaysAgo(now, 4, 16), "owner", "invoice_sent", "Approved INV-1001 and sent the PayPal invoice.", "inv_1001", "job_1001"),
    log("log_03", "shop_northline", isoDaysAgo(now, 8), "paypal", "payment_recorded", "INV-1002 was paid in full.", "inv_1002", "job_1002"),
    log("log_04", "shop_northline", isoDaysAgo(now, 0, 18), "agent", "draft_created", "Drafted INV-1003. It is over the auto-send threshold, so it is waiting for approval.", "inv_1003", "job_1003"),
    log("log_05", "shop_harborline", isoDaysAgo(now, 7), "agent", "reminder_sent", "Sent the day 3 reminder for INV-1004.", "inv_1004", "job_1004"),
    log("log_06", "shop_harborline", isoDaysAgo(now, 6), "paypal", "payment_recorded", "Recorded a partial payment of $100.00 on INV-1005.", "inv_1005", "job_1005"),
    log("log_07", "shop_switchback", isoDaysAgo(now, 9), "agent", "reminder_sent", "Sent the day 7 reminder for INV-1006 and mentioned Pay Later.", "inv_1006", "job_1006"),
    log("log_08", "shop_switchback", isoDaysAgo(now, 2), "paypal", "payment_recorded", "INV-1007 was paid in full.", "inv_1007", "job_1007"),
  ];

  return { shops, customers, jobs, invoices, logs, events: [] };
}

function job(id: string, customer: Customer, notes: string, completedAt: string): Job {
  return {
    id,
    shopId: customer.shopId,
    customerId: customer.id,
    trade: customer.shopId === "shop_northline" ? "hvac" : customer.shopId === "shop_harborline" ? "plumbing" : "electrical",
    notes,
    status: "invoiced",
    completedAt,
  };
}

function line(
  code: string,
  name: string,
  description: string,
  quantity: number,
  unitPriceCents: number,
): Invoice["lines"][number] {
  return {
    code,
    name,
    description,
    quantity,
    unitPriceCents,
    amountCents: Math.round(quantity * unitPriceCents),
  };
}

function invoice(input: {
  id: string;
  number: string;
  job: Job;
  customer: Customer;
  status: Invoice["status"];
  lines: Invoice["lines"];
  confidence: Invoice["confidence"];
  customerNote: string;
  sentAt?: string;
  paidAt?: string;
  paidCents?: number;
  remindersSent: Invoice["remindersSent"];
}): Invoice {
  const subtotalCents = input.lines.reduce((sum, item) => sum + item.amountCents, 0);
  return {
    id: input.id,
    shopId: input.job.shopId,
    jobId: input.job.id,
    customerId: input.customer.id,
    number: input.number,
    status: input.status,
    lines: input.lines,
    subtotalCents,
    paidCents: input.paidCents ?? (input.status === "paid" ? subtotalCents : 0),
    confidence: input.confidence,
    note: input.job.notes,
    customerNote: input.customerNote,
    sendError: null,
    paypalInvoiceId: input.sentAt ? `INV2-MOCK-${input.number}` : null,
    paypalOrderId: null,
    payUrl: input.sentAt ? `/pay/${input.id}` : null,
    gatewayMode: "mock",
    sentAt: input.sentAt ?? null,
    paidAt: input.paidAt ?? null,
    remindersSent: input.remindersSent,
  };
}

function log(
  id: string,
  shopId: string,
  at: string,
  actor: AgentLogEntry["actor"],
  action: string,
  detail: string,
  invoiceId: string | null,
  jobId: string | null,
): AgentLogEntry {
  return { id, shopId, at, actor, action, detail, invoiceId, jobId };
}
