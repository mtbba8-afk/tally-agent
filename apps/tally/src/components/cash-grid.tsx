"use client";

import { useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

const tallyTheme = themeQuartz.withParams({
  backgroundColor: "#fbf7f1",
  foregroundColor: "#1c1915",
  headerBackgroundColor: "#efe7d8",
  accentColor: "#1f4d45",
  borderColor: "#e4d9c8",
  browserColorScheme: "light",
  fontFamily: "Outfit, sans-serif",
});

export type CashGridRow = {
  customer: string;
  number: string;
  invoiceId: string;
  status: string;
  bucket: string;
  ageDays: number;
  balance: string;
  expected: string;
  callToday: string;
  reason: string;
};

export function CashGrid({ rows }: { rows: CashGridRow[] }) {
  const [quick, setQuick] = useState("");
  const columnDefs = useMemo<ColDef<CashGridRow>[]>(
    () => [
      { field: "customer", headerName: "Customer", flex: 1.2, minWidth: 140 },
      {
        field: "number",
        headerName: "Invoice",
        width: 120,
        cellRenderer: (props: { value: string; data: CashGridRow }) => (
          <a href={`/invoices/${props.data.invoiceId}`} className="text-accent">
            {props.value}
          </a>
        ),
      },
      { field: "status", headerName: "Status", width: 130 },
      { field: "bucket", headerName: "Aging", width: 110 },
      { field: "ageDays", headerName: "Days", width: 90, filter: "agNumberColumnFilter" },
      { field: "balance", headerName: "Balance", width: 120 },
      { field: "expected", headerName: "Expected", width: 130 },
      { field: "callToday", headerName: "Call today", width: 120 },
      { field: "reason", headerName: "Why", flex: 1.4, minWidth: 180 },
    ],
    [],
  );

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p className="text-sm text-muted">Receivables. Sort and filter any column.</p>
        <input
          value={quick}
          onChange={(event) => setQuick(event.target.value)}
          placeholder="Filter the book"
          className="h-9 rounded-full border border-line bg-background px-3 text-sm"
        />
      </div>
      <div style={{ height: 460 }}>
        <AgGridReact<CashGridRow>
          theme={tallyTheme}
          rowData={rows}
          columnDefs={columnDefs}
          quickFilterText={quick}
          defaultColDef={{ sortable: true, filter: true, resizable: true }}
          animateRows
        />
      </div>
    </div>
  );
}
