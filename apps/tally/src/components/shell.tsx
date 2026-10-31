import Link from "next/link";
import { ShopSelect } from "@/components/shop-select";
import { formatWhen, runtimeMode } from "@/lib/runtime";
import type { Shop } from "@/lib/types";

const links = [
  { href: "/", label: "Desk" },
  { href: "/front-office", label: "Office" },
  { href: "/jobs", label: "Jobs" },
  { href: "/invoices", label: "Invoices" },
  { href: "/activity", label: "Activity" },
  { href: "/ask", label: "Ask" },
];

export function Shell({
  shop,
  shops,
  children,
}: {
  shop: Shop;
  shops: Shop[];
  children: React.ReactNode;
}) {
  const mode = runtimeMode();
  return (
    <div className="min-h-full">
      <div className="mx-auto flex max-w-6xl">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
          <Link href="/" className="font-display text-3xl tracking-tight">
            Tally
          </Link>
          <p className="mt-1 text-sm text-muted">Get paid when the job is done.</p>
          <nav className="mt-8 flex flex-col gap-1">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full px-3 py-2 text-sm hover:bg-[#efe7d8]">
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="mt-auto text-xs leading-5 text-muted">Sample shops and customers are fictional.</p>
        </aside>
        <div className="min-w-0 flex-1 pb-24 md:pb-10">
          <header className="flex flex-col gap-3 border-b border-line px-4 py-4 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">{shop.city}</p>
              <ShopSelect shops={shops} current={shop.id} />
            </div>
            <p className="max-w-sm text-sm text-muted">
              {mode.paypal === "sandbox" ? "PayPal sandbox is connected." : "PayPal is in mock mode until sandbox keys are set."}{" "}
              {mode.ai === "gateway" ? "The model is on." : "Drafts use the price book."}{" "}
              {shop.simulatedNow ? `Demo clock: ${formatWhen(shop.simulatedNow)} ET.` : "Clock is the real time."}
            </p>
          </header>
          <main className="px-4 py-6 md:px-8">{children}</main>
        </div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-card md:hidden">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="flex-1 py-3 text-center text-xs">
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
