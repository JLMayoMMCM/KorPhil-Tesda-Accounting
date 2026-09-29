"use client"

import { ExternalLinkIcon, FileTextIcon, LayoutDashboardIcon, MapIcon, ReceiptIcon, SettingsIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import type { Tab } from "@/lib/ledger"

type Props = { counts: Record<Tab, number>; sheetTitle: string; synced: string; sheetUrl: string }

export function AppSidebar({ counts, sheetTitle, synced, sheetUrl }: Props) {
  const path = usePathname()
  const tab = useSearchParams().get("tab") ?? "all"
  const onVouchers = path.startsWith("/vouchers")

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />}>
              <Image src="/logo.webp" alt="" width={32} height={32} />
              <span className="flex flex-col leading-tight">
                <strong className="font-semibold">KorPhil-TESDA</strong>
                <small className="text-muted-foreground">Disbursements</small>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu aria-label="Main">
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path === "/"} render={<Link href="/" />}>
                <LayoutDashboardIcon />Workspace
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={onVouchers && tab === "all"} render={<Link href="/vouchers/" />}>
                <ReceiptIcon />Vouchers
              </SidebarMenuButton>
              <SidebarMenuBadge>{counts.all}</SidebarMenuBadge>
              <SidebarMenuSub>
                {([["overdue", "Overdue"], ["week", "Due this week"], ["unpaid", "Unpaid"]] as const).map(([key, name]) => (
                  <SidebarMenuSubItem key={key}>
                    <SidebarMenuSubButton isActive={onVouchers && tab === key} render={<Link href={`/vouchers/?tab=${key}`} />}>
                      <span>{name}</span>
                      <span className={key === "overdue" && counts.overdue ? "ml-auto font-semibold text-destructive tabular-nums" : "ml-auto text-muted-foreground tabular-nums"}>
                        {counts[key]}
                      </span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/areas")} render={<Link href="/areas/" />}>
                <MapIcon />Trade Areas
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/reports")} render={<Link href="/reports/" />}>
                <FileTextIcon />Reports
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/settings")} render={<Link href="/settings/" />}>
                <SettingsIcon />Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1 p-4 text-xs">
        <strong className="truncate text-sm font-medium">{sheetTitle || "Google Sheet"}</strong>
        <span className="text-muted-foreground">{synced}</span>
        {sheetUrl && (
          <a className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline" href={sheetUrl} target="_blank" rel="noopener">
            Open in Google Sheets<ExternalLinkIcon className="size-3" />
          </a>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
