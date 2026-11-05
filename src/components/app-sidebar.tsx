"use client"

import { ExternalLinkIcon, FileSpreadsheetIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarRail,
} from "@/components/ui/sidebar"
import { TABS, type Tab } from "@/lib/ledger"
import { MODULES, type Module, type NavItem } from "@/lib/nav"

type Props = { module: Module; counts?: Record<Tab, number>; sheetTitle: string; synced: string; sheetUrl: string }

export function AppSidebar({ module, counts, sheetTitle, synced, sheetUrl }: Props) {
  const path = usePathname()
  const tab = useSearchParams().get("tab") ?? "all"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="All modules" render={<Link href="/" />}>
              <Image src="/tesda_korphil_logo.png" alt="" width={32} height={32} />
              <span className="flex flex-col leading-tight">
                <strong className="font-semibold">KorPhil-TESDA</strong>
                <small className="text-sidebar-foreground/70">{MODULES[module].name}</small>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu aria-label="Main">
            {(MODULES[module].nav as NavItem[]).map(({ title, href, icon: Icon, tabs }) => {
              const here = path.startsWith(href.slice(0, -1))
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={here && (!tabs || tab === "all")} tooltip={title} render={<Link href={href} />}>
                    <Icon />{title}
                  </SidebarMenuButton>
                  {tabs && counts && <>
                    <SidebarMenuBadge>{counts.all}</SidebarMenuBadge>
                    <SidebarMenuSub>
                      {(Object.entries(TABS) as [Tab, string][]).filter(([key]) => key !== "all").map(([key, name]) => (
                        <SidebarMenuSubItem key={key}>
                          <SidebarMenuSubButton isActive={here && tab === key} render={<Link href={`${href}?tab=${key}`} />}>
                            <span>{name}</span>
                            <span className="ml-auto text-sidebar-foreground/70 tabular-nums">
                              {counts[key]}
                            </span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </>}
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The file's name, opening it; collapsed, only the icon (its name in the tooltip). */}
            <SidebarMenuButton size="lg" tooltip={`Open ${sheetTitle || "Google Sheet"}`}
              className="h-auto min-h-12 group-data-[collapsible=icon]:min-h-0 group-data-[collapsible=icon]:p-2!"
              render={sheetUrl ? <a href={sheetUrl} target="_blank" rel="noopener" aria-label={`Open ${sheetTitle || "Google Sheet"}`} /> : <div />}>
              <FileSpreadsheetIcon />
              <span className="flex min-w-0 flex-col text-xs leading-tight group-data-[collapsible=icon]:hidden">
                <strong className="text-sm font-medium break-words">{sheetTitle || "Google Sheet"}</strong>
                <span className="truncate text-sidebar-foreground/70">{synced}</span>
              </span>
              {sheetUrl && <ExternalLinkIcon className="ml-auto opacity-70 group-data-[collapsible=icon]:hidden" />}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
