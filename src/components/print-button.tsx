"use client"

import { PrinterIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Browsers suggest the page title as the PDF's file name, so it reads as the report's name while printing. */
export function PrintButton({ filename }: { filename: string }) {
  const print = () => {
    const title = document.title
    document.title = filename
    window.addEventListener("afterprint", () => { document.title = title }, { once: true })
    window.print()
  }
  return (
    <Button variant="outline" onClick={print}>
      <PrinterIcon data-icon="inline-start" />Save as PDF
    </Button>
  )
}
