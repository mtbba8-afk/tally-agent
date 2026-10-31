import { JobForm } from "@/components/job-form";
import { viewLedger } from "@/lib/ledger";
import { currentShopId } from "@/lib/runtime";

export default async function NewJobPage() {
  const data = await viewLedger();
  const shopId = await currentShopId(data);
  const shop = data.shops.find((item) => item.id === shopId);
  const customers = data.customers
    .filter((customer) => customer.shopId === shopId)
    .map((customer) => ({ id: customer.id, name: customer.name }));

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-4xl tracking-tight">Log a finished job</h1>
      <p className="mt-2 text-sm text-muted">
        Write what the tech said. {shop?.name} prices it from the {shop?.trade} book, then waits if the total needs a person.
      </p>
      <div className="mt-6">
        <JobForm customers={customers} />
      </div>
    </div>
  );
}
