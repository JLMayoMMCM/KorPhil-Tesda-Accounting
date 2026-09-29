"use client"

import { RefreshCwIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { sync } from "@/app/actions"
import { useUI } from "@/components/app-ui"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

export function SyncButton({ children = "Sync now", ...props }: React.ComponentProps<typeof Button>) {
  const { run } = useUI()
  const router = useRouter()
  return (
    <Button
      {...props}
      onClick={async () => {
        const result = await run("Pulling from the sheet…", sync)
        if (!result.ok) return
        toast.add({ title: result.message, type: "success" })
        router.refresh()
      }}
    >
      <RefreshCwIcon data-icon="inline-start" />{children}
    </Button>
  )
}
