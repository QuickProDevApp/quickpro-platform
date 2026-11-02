"use client";

import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where the invoice can also be saved as a PDF. */
export function PrintButton({ children = "Print or save as PDF" }: { children?: React.ReactNode }) {
  return (
    <Button type="button" variant="secondary" onClick={() => window.print()}>
      {children}
    </Button>
  );
}
