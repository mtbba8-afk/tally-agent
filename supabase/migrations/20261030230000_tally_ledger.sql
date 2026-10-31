-- Tally ledger. Server access uses the service role. The browser has no policies.

create table public.shops (
  id text primary key,
  name text not null,
  trade text not null check (trade in ('hvac', 'plumbing', 'electrical')),
  city text not null,
  owner_given_name text not null,
  owner_surname text not null,
  email text not null,
  auto_send_threshold_cents integer not null check (auto_send_threshold_cents >= 0),
  simulated_now timestamptz
);

create table public.customers (
  id text primary key,
  shop_id text not null references public.shops (id),
  name text not null,
  email text not null,
  phone text not null
);

create table public.jobs (
  id text primary key,
  shop_id text not null references public.shops (id),
  customer_id text not null references public.customers (id),
  trade text not null,
  notes text not null,
  status text not null check (status in ('open', 'done', 'invoiced')),
  completed_at timestamptz
);

create table public.invoices (
  id text primary key,
  shop_id text not null references public.shops (id),
  job_id text not null references public.jobs (id),
  customer_id text not null references public.customers (id),
  number text not null unique,
  status text not null,
  lines jsonb not null,
  subtotal_cents integer not null,
  paid_cents integer not null default 0,
  confidence text not null,
  note text not null,
  customer_note text not null default '',
  send_error text,
  paypal_invoice_id text,
  paypal_order_id text,
  pay_url text,
  gateway_mode text not null,
  sent_at timestamptz,
  paid_at timestamptz,
  reminders_sent jsonb not null default '[]'::jsonb
);

create table public.agent_log (
  id text primary key,
  shop_id text not null references public.shops (id),
  at timestamptz not null,
  actor text not null,
  action text not null,
  detail text not null,
  invoice_id text,
  job_id text
);

create table public.paypal_events (
  id text primary key,
  received_at timestamptz not null default now(),
  event_type text not null,
  payload jsonb not null
);

alter table public.shops enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.invoices enable row level security;
alter table public.agent_log enable row level security;
alter table public.paypal_events enable row level security;

-- No anon or authenticated policies. The service role bypasses RLS.
-- Add owner-scoped policies before exposing any of these tables to the browser.
