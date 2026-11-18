"use client"

import { DownloadIcon, LogOutIcon, PlusIcon, SearchIcon } from "lucide-react"
import Form from "next/form"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { signOut } from "@/app/actions"
import { SyncButton } from "@/components/sync-button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { qs } from "@/lib/ledger"
import { MODULES, type Module } from "@/lib/nav"
import type { GoogleUser } from "@/lib/session"

// Below lg the header can't fit labelled actions on one row, so they go icon-only (the label stays for screen readers).
const ICON_BELOW_LG = "max-lg:size-8 max-lg:p-0"

/** readOnly: a closed year is shown, so there's no New button. */
export function AppHeader({ module, user, synced = "", readOnly = false }: { module: Module; user: GoogleUser; synced?: string; readOnly?: boolean }) {
  const path = usePathname()
  const params = useSearchParams()
  const title = MODULES[module].nav.find((i) => path.startsWith(i.href.slice(0, -1)))?.title ?? MODULES[module].name
  const name = `${user.first_name} ${user.last_name}`.trim() || user.email
  // Export follows the voucher list's filters when on it.
  const exportUrl = "/voucher/vouchers/export/" + (path.startsWith("/voucher/vouchers") ? qs(params, { open: null, new: null }) : "")

  return (
    <header className="print:hidden sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
      <SidebarTrigger />
      <h1 className="mr-2 font-heading text-lg font-semibold">{title}</h1>
      {/* The voucher tools; other modules get their own once they're built. */}
      {module === "voucher" && <>
        {!readOnly && (
          <Button render={<Link href="/voucher/vouchers/?new=1" />} nativeButton={false} data-key="n">
            <PlusIcon data-icon="inline-start" />New DV<Kbd className="max-md:hidden">N</Kbd>
          </Button>
        )}
        <Form action="/voucher/vouchers/" role="search" className="min-w-48 flex-1 max-md:order-last max-md:basis-full md:max-w-sm">
          <InputGroup>
            <InputGroupAddon><SearchIcon /></InputGroupAddon>
            <InputGroupInput
              id="search" type="search" name="q" key={params.get("q")} defaultValue={params.get("q") ?? ""}
              placeholder="Find DV #, payee, or amount (>5000)" aria-label="Find vouchers by DV #, payee, particulars, or amount" autoComplete="off"
            />
            <InputGroupAddon align="inline-end" className="max-md:hidden"><Kbd>Ctrl K</Kbd></InputGroupAddon>
          </InputGroup>
        </Form>
      </>}
      <div className="ml-auto flex items-center gap-2">
        {module === "voucher" && <>
          <Button variant="outline" render={<Link href="/voucher/reports/" />} nativeButton={false} className="hidden xl:inline-flex">Run report</Button>
          <Button variant="outline" render={<a href={exportUrl} download title="Export" />} nativeButton={false} className={ICON_BELOW_LG}>
            <DownloadIcon data-icon="inline-start" /><span className="max-lg:sr-only">Export</span>
          </Button>
          {synced && <span className="hidden text-xs text-muted-foreground 2xl:inline">Synced {synced}</span>}
          <SyncButton variant="outline" title="Sync" className={ICON_BELOW_LG}><span className="max-lg:sr-only">Sync</span></SyncButton>
        </>}
        {module === "collection" && <>
          {!readOnly && (
            <Button render={<Link href="/collection/collections/?new=1" />} nativeButton={false} data-key="n">
              <PlusIcon data-icon="inline-start" />New collection<Kbd className="max-md:hidden">N</Kbd>
            </Button>
          )}
          <Button variant="outline" render={<Link href="/collection/reports/" />} nativeButton={false} className="hidden xl:inline-flex">Run report</Button>
          {synced && <span className="hidden text-xs text-muted-foreground 2xl:inline">Synced {synced}</span>}
          <SyncButton variant="outline" module="collection" title="Sync" className={ICON_BELOW_LG}><span className="max-lg:sr-only">Sync</span></SyncButton>
        </>}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={`Account: ${name}`} />}>
            <Avatar>
              <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />
              <AvatarFallback>{(user.first_name || user.email).charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col">
                <span className="font-medium text-foreground">{name}</span>
                <span className="font-normal">{user.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOutIcon />Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
