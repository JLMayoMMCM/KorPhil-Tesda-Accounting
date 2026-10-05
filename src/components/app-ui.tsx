"use client"

// Page behavior shared by every screen (was app.js): confirm and busy dialogs, error toasts,
// the unsaved-changes guard, and keyboard shortcuts.
import { useRouter } from "next/navigation"
import * as React from "react"

import type { Result } from "@/app/actions"
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

type Ask = { title: string; note: string; ok: string; resolve: (yes: boolean) => void }
type UI = {
  /** Ask first; resolves true on OK. */
  confirm: (title: string, note: string, ok: string) => Promise<boolean>
  /** Block the page while a sheet write runs; toasts a failure unless the caller shows it inline. */
  run: <T extends Result>(busy: string, action: () => Promise<T>, opts?: { inlineError?: boolean }) => Promise<T>
  /** Changed field names of the open voucher form ("" when clean). */
  setDirty: (changed: string) => void
  /** Run navigate() now, or after "Discard unsaved changes?" if the form has edits. */
  leave: (navigate: () => void) => void
}
const Ctx = React.createContext<UI | null>(null)
export const useUI = () => React.use(Ctx)!

export function AppUI({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ask, setAsk] = React.useState<Ask | null>(null)
  const [busy, setBusy] = React.useState("")
  const [, startTransition] = React.useTransition()
  const dirty = React.useRef("")

  const confirm = React.useCallback<UI["confirm"]>(
    (title, note, ok) => new Promise((resolve) => setAsk({ title, note, ok, resolve })), [])
  const answer = (yes: boolean) => {
    ask?.resolve(yes)
    setAsk(null)
  }

  const run = React.useCallback<UI["run"]>(async (text, action, opts) => {
    setBusy(text)
    try {
      const result = await action()
      if (!result.ok && !opts?.inlineError) toast.add({ title: result.message, type: "error" })
      return result
    } catch {
      toast.add({ title: "Something went wrong. Check your connection and try again.", type: "error" })
      return { ok: false, message: "" } as Awaited<ReturnType<typeof action>>
    } finally {
      setBusy("")
    }
  }, [])

  const leave = React.useCallback<UI["leave"]>((navigate) => {
    if (!dirty.current) return navigate()
    confirm("Discard unsaved changes?", `${dirty.current}. Not saved to the sheet yet.`, "Discard").then((yes) => {
      if (!yes) return
      dirty.current = ""
      navigate()
    })
  }, [confirm])
  const setDirty = React.useCallback((changed: string) => { dirty.current = changed }, [])

  React.useEffect(() => {
    // Links ask before dropping edits (the App Router has no navigation-block API, so catch clicks first).
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || !dirty.current || a.target || a.hasAttribute("download") || e.ctrlKey || e.metaKey || e.shiftKey || a.origin !== location.origin) return
      e.preventDefault()
      e.stopPropagation()
      leave(() => startTransition(() => router.push(a.pathname + a.search)))
    }
    const onUnload = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return // the dialog owns the keyboard
      const typing = (e.target as Element).closest?.("input, textarea, select, [contenteditable]")
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === "k") {
        e.preventDefault()
        document.querySelector<HTMLInputElement>("#search")?.focus()
      } else if (mod && key === "s") {
        const form = document.querySelector<HTMLFormElement>("[data-voucher-form]")
        if (form) { e.preventDefault(); form.requestSubmit() }
      } else if (e.key === "Escape") {
        if (typing) (e.target as HTMLElement).blur()
        else document.querySelector<HTMLElement>('[data-key="escape"]')?.click()
      } else if (!typing && !mod && !e.altKey) {
        const target = document.querySelector<HTMLElement>(`[data-key="${key}"]`)
        if (target) { e.preventDefault(); target.click() }
      }
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onUnload)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onUnload)
      document.removeEventListener("keydown", onKey)
    }
  }, [leave, router])

  const ui = React.useMemo(() => ({ confirm, run, setDirty, leave }), [confirm, run, setDirty, leave])
  return (
    <Ctx value={ui}>
      {children}
      <AlertDialog open={!!ask} onOpenChange={(open) => { if (!open) answer(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            <AlertDialogDescription>{ask?.note}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button autoFocus onClick={() => answer(true)}>{ask?.ok}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!busy} disablePointerDismissal>
        <DialogContent showCloseButton={false} className="flex items-center gap-3" onKeyDown={(e) => e.key === "Escape" && e.preventDefault()}>
          <Spinner />
          <div className="flex flex-col gap-1">
            <DialogTitle role="status">{busy}</DialogTitle>
            <DialogDescription>Keep this page open until it finishes.</DialogDescription>
          </div>
        </DialogContent>
      </Dialog>
    </Ctx>
  )
}
