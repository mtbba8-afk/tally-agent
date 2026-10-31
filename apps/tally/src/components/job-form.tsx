"use client";

import { useActionState } from "react";
import { createFinishedJob } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function JobForm({ customers }: { customers: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(createFinishedJob, null);

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        Customer
        <select
          name="customerId"
          required
          className="mt-1 flex h-10 w-full rounded-xl border border-line bg-card px-3 text-sm"
          defaultValue={customers[0]?.id}
        >
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Job notes
        <Textarea
          name="notes"
          required
          className="mt-1"
          placeholder="Replaced capacitor, 2 hrs, unit 3B"
        />
      </label>
      {state?.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Drafting..." : "Draft the invoice"}
      </Button>
    </form>
  );
}
