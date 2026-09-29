"use client"

import { PrinterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <PrinterIcon data-icon="inline-start" />Print or save as PDF
    </Button>
  )
}
