import { ArrowRightIcon, CircleAlertIcon, ClipboardListIcon, ExternalLinkIcon, LockIcon, LogOutIcon, PlusIcon, ReceiptIcon } from "lucide-react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import Image from "next/image"
import Link from "next/link"

import { openYear, signOut } from "@/app/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { OpenRowButton } from "@/components/open-row-button"
import { Button } from "@/components/ui/button"
import { getSession, YEAR_COOKIE } from "@/lib/data"
import { COLLECTION_HOME, VOUCHER_HOME } from "@/lib/nav"
import { fullName } from "@/lib/session"
import { DEFAULT_TAB, sheetUrl } from "@/lib/sheets"
import { cn } from "@/lib/utils"
import { pickYear, yearsFor, type YearRow } from "@/lib/years"
import { readYears } from "@/lib/years-sheet"

export const metadata: Metadata = { title: "Spreadsheets" }

/** Each accounting module: its card (no years listed yet) and its line on a year's card. */
const MODULES = {
  voucher: { title: "Disbursement Vouchers", text: "Record, review and report on DVs synced with the Google Sheet.", icon: ReceiptIcon, href: VOUCHER_HOME },
  collection: { title: "Collection Sheet", text: "Track collections and official receipts.", icon: ClipboardListIcon, href: COLLECTION_HOME },
}

/** The home page after sign-in: every year's spreadsheet from the Years list, each module ready to open. */
export default async function Portal() {
  const { user, access_token: token } = await getSession()
  const name = fullName(user)
  const { rows, error } = await readYears(token)
  // One card per year, newest first, listing the modules that year has (Hidden years and bad links are left out).
  const byYear = new Map<string, YearRow[]>()
  for (const r of [...yearsFor(rows, "voucher"), ...yearsFor(rows, "collection")]) byYear.set(r.year, [...(byYear.get(r.year) ?? []), r])
  const years = [...byYear].sort(([a], [b]) => b.localeCompare(a))
  // The year the modules show right now (the one last opened, else the newest Active one).
  const wanted = (await cookies()).get(YEAR_COOKIE)?.value ?? ""
  const current = (pickYear(rows, "voucher", wanted) ?? pickYear(rows, "collection", wanted))?.year

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
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">Welcome, {user.first_name || name}</h1>
            <p className="text-muted-foreground">
              {years.length ? "Choose a spreadsheet to open. Each year is its own spreadsheet." : "Choose a module to open."}
            </p>
          </div>
          <Button variant="outline" className="ml-auto" render={<Link href="/sources/#add" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />Add spreadsheet
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {years.length ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {years.map(([year, list]) => {
              const closed = list.every((r) => r.status === "Read-only")
              return (
                <li key={year} aria-current={year === current ? "true" : undefined}
                  className={cn("flex flex-col gap-2 rounded-xl border bg-card p-5 text-card-foreground shadow-xs", year === current && "border-primary ring-1 ring-primary")}>
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-xl font-semibold tabular-nums">{year}</h2>
                    {closed ? <Badge variant="secondary"><LockIcon />Read-only</Badge> : <Badge variant="outline">Active</Badge>}
                  </div>
                  <ul className="divide-y border-t">
                    {list.map((r) => {
                      const { title, icon: Icon } = MODULES[r.module]
                      return (
                        // The whole row opens the module (the button's ::after covers it); a sheen sweeps across on hover.
                        <li key={r.module} className="group relative -mx-3 flex items-center gap-3 overflow-hidden rounded-lg px-3 py-4 transition-[background-color,translate,scale] hover:bg-accent has-[button:active]:translate-y-0.5 has-[button:active]:scale-[0.99] has-focus-visible:bg-accent has-focus-visible:ring-2 has-focus-visible:ring-ring/50">
                          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -translate-x-full -skew-x-12 bg-linear-to-r from-transparent via-white/70 to-transparent group-hover:translate-x-[400%] group-hover:transition-transform group-hover:duration-700 motion-reduce:hidden dark:via-white/15" />
                          <Icon className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="font-medium">{title}</span>
                            <a href={sheetUrl(r.id)} target="_blank" rel="noopener" className="relative z-10 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
                              Tab {r.tab || DEFAULT_TAB[r.module]}{r.status === "Read-only" && !closed ? " · read-only" : ""}
                              <ExternalLinkIcon className="size-3.5" /><span className="sr-only">(opens the spreadsheet)</span>
                            </a>
                          </div>
                          <form action={openYear.bind(null, r.year, r.module)}>
                            <OpenRowButton label={`Open ${year} ${title}`} />
                          </form>
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {Object.values(MODULES).map(({ title, text, icon: Icon, href }) => (
              <li key={title}>
                <Link href={href} className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-colors hover:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-sidebar text-sidebar-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className="flex flex-col gap-1">
                    <span className="flex items-center gap-2 font-heading text-lg font-semibold">
                      {title}
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
        )}

        <p className="text-sm text-muted-foreground">
          <Link href="/sources/" className="font-medium text-primary underline-offset-4 hover:underline">Data sources</Link> is
          where a new year is added, a closed one set to read-only, or one hidden from this list.
        </p>
      </main>
    </div>
  )
}
