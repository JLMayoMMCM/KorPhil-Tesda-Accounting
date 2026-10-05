"use client"

import { ExternalLinkIcon, FileSpreadsheetIcon, FileTextIcon, HomeIcon, LayoutDashboardIcon, MapIcon, ReceiptIcon, SettingsIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail,
} from "@/components/ui/sidebar"
import { TABS, type Tab } from "@/lib/ledger"

type Props = { counts: Record<Tab, number>; sheetTitle: string; synced: string; sheetUrl: string }

export function AppSidebar({ counts, sheetTitle, synced, sheetUrl }: Props) {
  const path = usePathname()
  const tab = useSearchParams().get("tab") ?? "all"
  const onVouchers = path.startsWith("/vouchers")

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="KorPhil-TESDA" render={<Link href="/" />}>
              <Image src="/logo.webp" alt="" width={32} height={32} />
              <span className="flex flex-col leading-tight">
                <strong className="font-semibold">KorPhil-TESDA</strong>
                <small className="text-sidebar-foreground/70">Disbursements</small>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu aria-label="Main">
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/dashboard")} tooltip="Dashboard" render={<Link href="/dashboard/" />}>
                <HomeIcon />Dashboard
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path === "/"} tooltip="Workspace" render={<Link href="/" />}>
                <LayoutDashboardIcon />Workspace
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={onVouchers && tab === "all"} tooltip="Vouchers" render={<Link href="/vouchers/" />}>
                <ReceiptIcon />Vouchers
              </SidebarMenuButton>
              <SidebarMenuBadge>{counts.all}</SidebarMenuBadge>
              <SidebarMenuSub>
                {(Object.entries(TABS) as [Tab, string][]).filter(([key]) => key !== "all").map(([key, name]) => (
                  <SidebarMenuSubItem key={key}>
                    <SidebarMenuSubButton isActive={onVouchers && tab === key} render={<Link href={`/vouchers/?tab=${key}`} />}>
                      <span>{name}</span>
                      <span className="ml-auto text-sidebar-foreground/70 tabular-nums">
                        {counts[key]}
                      </span>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
              </SidebarMenuSub>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/areas")} tooltip="Trade Areas" render={<Link href="/areas/" />}>
                <MapIcon />Trade Areas
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/reports")} tooltip="Reports" render={<Link href="/reports/" />}>
                <FileTextIcon />Reports
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={path.startsWith("/settings")} tooltip="Settings" render={<Link href="/settings/" />}>
                <SettingsIcon />Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={`Open ${sheetTitle || "Google Sheet"}`} className="h-auto min-h-12"
              render={sheetUrl ? <a href={sheetUrl} target="_blank" rel="noopener" /> : <div />}>
              <FileSpreadsheetIcon />
              <span className="flex min-w-0 flex-col text-xs leading-tight">
                <strong className="text-sm font-medium break-words">{sheetTitle || "Google Sheet"}</strong>
                <span className="truncate text-sidebar-foreground/70">{synced}</span>
              </span>
              {sheetUrl && <ExternalLinkIcon className="ml-auto opacity-70" />}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
