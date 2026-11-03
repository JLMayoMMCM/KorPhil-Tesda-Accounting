"use client"

import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { sync, syncCollections } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import type { Module } from "@/lib/nav"

export function SyncButton({ children = "Sync now", module = "voucher", ...props }: React.ComponentProps<typeof Button> & { module?: Module }) {
  const { run } = useUI()
  const router = useRouter()
  return (
    <Button
      {...props}
      onClick={async () => {
        const result = await run("Pulling from the sheet…", module === "collection" ? syncCollections : sync)
        if (!result.ok) return
        toast.add({ title: result.message, type: "success" })
        router.refresh()
      }}
    >
      <RefreshCwIcon data-icon="inline-start" />{children}
    </Button>
  )
}
