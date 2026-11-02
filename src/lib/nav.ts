import {
  ClipboardListIcon, FileTextIcon, HomeIcon, ListChecksIcon, MapIcon, ReceiptIcon, SettingsIcon, type LucideIcon,
} from "lucide-react"

/** Where sign-in lands when there's no page to return to: the module portal. */
export const HOME = "/"

/** Each module's landing page, linked from the portal. */
export const VOUCHER_HOME = "/voucher/dashboard/"
export const COLLECTION_HOME = "/collection/dashboard/"

/** Only same-site paths ("/voucher/vouchers/?tab=review"), never "//evil.com" or "https://…". */
export const safeNext = (url: string | null | undefined, fallback = HOME) =>
  url && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : fallback

export type NavItem = { title: string; href: string; icon: LucideIcon; tabs?: true }

/** Every module shares this sidebar; only its name and menu differ. `tabs` lists the voucher tabs under that item. */
export const MODULES = {
  voucher: {
    name: "Disbursements",
    nav: [
      { title: "Dashboard", href: VOUCHER_HOME, icon: HomeIcon },
      { title: "Workspace", href: "/voucher/workspace/", icon: ListChecksIcon },
      { title: "Vouchers", href: "/voucher/vouchers/", icon: ReceiptIcon, tabs: true },
      { title: "Trade Areas", href: "/voucher/areas/", icon: MapIcon },
      { title: "Reports", href: "/voucher/reports/", icon: FileTextIcon },
      { title: "Settings", href: "/voucher/settings/", icon: SettingsIcon },
    ],
  },
  collection: {
    name: "Collections",
    nav: [
      { title: "Dashboard", href: COLLECTION_HOME, icon: HomeIcon },
      { title: "Collections", href: "/collection/collections/", icon: ClipboardListIcon },
      { title: "Reports", href: "/collection/reports/", icon: FileTextIcon },
      { title: "Settings", href: "/collection/settings/", icon: SettingsIcon },
    ],
  },
} satisfies Record<string, { name: string; nav: NavItem[] }>
export type Module = keyof typeof MODULES
