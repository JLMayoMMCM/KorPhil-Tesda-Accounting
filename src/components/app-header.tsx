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
import type { GoogleUser } from "@/lib/session"

const TITLES: [string, string][] = [["/dashboard", "Dashboard"], ["/vouchers", "Vouchers"], ["/areas", "Trade Areas"], ["/reports", "Reports"], ["/settings", "Settings"]]

export function AppHeader({ user, synced }: { user: GoogleUser; synced: string }) {
  const path = usePathname()
  const params = useSearchParams()
  const title = TITLES.find(([p]) => path.startsWith(p))?.[1] ?? "Workspace"
  const name = `${user.first_name} ${user.last_name}`.trim() || user.email
  // Export follows the voucher list's filters when on it.
  const exportUrl = "/vouchers/export/" + (path.startsWith("/vouchers") ? qs(params, { open: null, new: null }) : "")

  return (
    <header className="print:hidden sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2">
      <SidebarTrigger />
      <h1 className="mr-2 font-heading text-lg font-semibold">{title}</h1>
      <Button render={<Link href="/vouchers/?new=1" />} nativeButton={false} data-key="n">
        <PlusIcon data-icon="inline-start" />New DV<Kbd>N</Kbd>
      </Button>
      <Form action="/vouchers/" role="search" className="min-w-48 flex-1 md:max-w-sm">
        <InputGroup>
          <InputGroupAddon><SearchIcon /></InputGroupAddon>
          <InputGroupInput
            id="search" type="search" name="q" key={params.get("q")} defaultValue={params.get("q") ?? ""}
            placeholder="Find DV #, payee, or particulars" aria-label="Find vouchers" autoComplete="off"
          />
          <InputGroupAddon align="inline-end"><Kbd>Ctrl K</Kbd></InputGroupAddon>
        </InputGroup>
      </Form>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" render={<Link href="/reports/" />} nativeButton={false} className="hidden lg:inline-flex">Run report</Button>
        <Button variant="outline" render={<a href={exportUrl} download />} nativeButton={false}>
          <DownloadIcon data-icon="inline-start" />Export
        </Button>
        {synced && <span className="hidden text-xs text-muted-foreground xl:inline">Synced {synced}</span>}
        <SyncButton variant="outline">Sync</SyncButton>
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
