import { ArrowRightIcon, ClipboardListIcon, LogOutIcon, ReceiptIcon } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { signOut } from "@/app/actions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getSession } from "@/lib/data"
import { COLLECTION_HOME, VOUCHER_HOME } from "@/lib/nav"
import { fullName } from "@/lib/session"

export const metadata: Metadata = { title: "Modules" }

/** Each accounting module gets a card linking to its landing page. */
const MODULES = [
  {
    title: "Disbursement Vouchers",
    text: "Record, review and report on DVs synced with the Google Sheet.",
    icon: ReceiptIcon,
    href: VOUCHER_HOME,
  },
  {
    title: "Collection Sheet",
    text: "Track collections and official receipts.",
    icon: ClipboardListIcon,
    href: COLLECTION_HOME,
    soon: true,
  },
]

/** The portal after sign-in: pick a module. */
export default async function Portal() {
  const { user } = await getSession()
  const name = fullName(user)

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-8">
          {/* The seal has white corners, so it sits on a white disc. */}
          <span className="block size-8 shrink-0 rounded-full bg-white p-0.5">
            <Image src="/tesda_korphil_logo.png" alt="" width={32} height={32} loading="eager" className="size-full rounded-full" />
          </span>
          <p className="font-semibold">KorPhil-TESDA <span className="font-normal text-sidebar-foreground/70">Accounting</span></p>
          <div className="ml-auto flex items-center gap-3">
            <Avatar className="size-7">
              <AvatarImage src={user.picture} alt="" referrerPolicy="no-referrer" />
              <AvatarFallback className="text-sidebar-primary-foreground">{(user.first_name || user.email).charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm sm:inline">{name}</span>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
                <LogOutIcon data-icon="inline-start" />Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Welcome, {user.first_name || name}</h1>
          <p className="text-muted-foreground">Choose a module to open.</p>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {MODULES.map(({ title, text, icon: Icon, href, soon }) => (
            <li key={title}>
              <Link href={href} className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-colors hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar text-sidebar-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2 font-heading text-lg font-semibold">
                    {title}
                    {soon && <Badge variant="secondary">Coming soon</Badge>}
                  </span>
                  <span className="text-sm text-muted-foreground">{text}</span>
                </span>
                <span className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
                  Open<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
