"use client";

import { setShop } from "@/app/actions";

export function ShopSelect({
  shops,
  current,
}: {
  shops: Array<{ id: string; name: string }>;
  current: string;
}) {
  return (
    <form action={setShop} className="mt-1">
      <label className="sr-only" htmlFor="shopId">
        Shop
      </label>
      <select
        id="shopId"
        name="shopId"
        defaultValue={current}
        className="max-w-full bg-transparent font-display text-2xl tracking-tight outline-none"
        onChange={(event) => {
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {shops.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </form>
  );
}
