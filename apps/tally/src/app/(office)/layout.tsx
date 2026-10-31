import { Shell } from "@/components/shell";
import { viewLedger } from "@/lib/ledger";
import { currentShopId } from "@/lib/runtime";

export default async function OfficeLayout({ children }: { children: React.ReactNode }) {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId) ?? data.shops[0];
  if (!shop) {
    return <p className="p-8">The ledger has no shops.</p>;
  }
  return (
    <Shell shop={shop} shops={data.shops}>
      {children}
    </Shell>
  );
}
