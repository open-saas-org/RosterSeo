"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// The one interactive element on an otherwise fully server-rendered,
// print-CSS-driven report page - window.print() needs a client component.
export function ReportPrintButton() {
  return (
    <Button onClick={() => window.print()} className="gap-2 print:hidden">
      <Printer className="size-4" />
      Print / Save as PDF
    </Button>
  );
}
