import { ArrowLeftIcon, CircleAlertIcon, ExternalLinkIcon, PlugIcon, UnplugIcon } from "lucide-react"
import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { yearRowAction } from "@/app/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AddYear, YearActions } from "@/components/year-sources"
import { getSession } from "@/lib/data"
import { canOpen, DEFAULT_TAB, envSource, sheetUrl } from "@/lib/sheets"
import { MODULE_NAMES, YEARS_TAB } from "@/lib/years"
import { readYears, YEARS_SHEET_ID } from "@/lib/years-sheet"

export const metadata: Metadata = { title: "Data sources" }

/**
 * Every year's spreadsheet, from the Years tab of the main spreadsheet: add a year, close it (Read-only), hide it, change
 * its link or tab, or take it off the list. Saving needs edit access to the main spreadsheet, which Google enforces.
 */
export default async function DataSources() {
  const { access_token: token } = await getSession()
  const { rows, error } = await readYears(token, true)
  // Whether this user can open each listed spreadsheet (checked with Google at most hourly per sheet).
  const access = await Promise.all(rows.map((r) => (r.id ? canOpen(token, r.id) : Promise.resolve("The link isn't a Google Sheets link."))))
  const next = String(Math.max(new Date().getFullYear(), ...rows.map((r) => Number(r.year) + 1)))

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
          <span className="block size-8 shrink-0 rounded-full bg-white p-0.5">
            <Image src="/tesda_korphil_logo.png" alt="" width={32} height={32} loading="eager" className="size-full rounded-full" />
          </span>
          <p className="font-semibold">KorPhil-TESDA <span className="font-normal text-sidebar-foreground/70">Data sources</span></p>
          <Button variant="ghost" size="sm" className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            render={<Link href="/" />} nativeButton={false}>
            <ArrowLeftIcon data-icon="inline-start" />Modules
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Data sources</h1>
          <p className="text-muted-foreground">
            Each year&apos;s ledger is its own spreadsheet. The list below is the {YEARS_TAB} tab of the{" "}
            <a className="underline underline-offset-4" href={sheetUrl(YEARS_SHEET_ID)} target="_blank" rel="noopener">main spreadsheet</a>;
            the year picker in each module&apos;s sidebar switches between them.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{error} Until it can be read, every page uses the spreadsheet set in .env.local.</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Years</CardTitle>
            <CardDescription>
              Active years can be edited. Read-only years are closed books: they can be read and reported on, and the server
              refuses any change to them. Hidden years are left out of the year picker. Removing a year only takes it off this
              list; the spreadsheet is never deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rows.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Spreadsheet</TableHead>
                      <TableHead>Tab</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead>Status and changes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => {
                      const label = `${r.year} ${MODULE_NAMES[r.module]}`
                      return (
                        <TableRow key={`${r.row}:${r.year}:${r.module}:${r.status}:${r.link}:${r.tab}`} className="align-top">
                          <TableCell className="font-medium tabular-nums">{r.year}</TableCell>
                          <TableCell>{MODULE_NAMES[r.module]}</TableCell>
                          <TableCell>
                            {r.id ? (
                              <a className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={sheetUrl(r.id)} target="_blank" rel="noopener">
                                Open<ExternalLinkIcon className="size-3.5" />
                              </a>
                            ) : <span className="text-destructive">Not a Google Sheets link</span>}
                          </TableCell>
                          <TableCell>{r.tab || <span className="text-muted-foreground">{DEFAULT_TAB[r.module]}</span>}</TableCell>
                          <TableCell className="max-w-64 whitespace-normal">
                            {access[i]
                              ? <span className="inline-flex items-start gap-1 text-destructive"><UnplugIcon className="mt-0.5 size-4 shrink-0" />{access[i]}</span>
                              : <Badge variant="secondary"><PlugIcon data-icon="inline-start" />Connected</Badge>}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{[r.by, r.on].filter(Boolean).join(" · ") || "—"}</TableCell>
                          <TableCell>
                            <YearActions action={yearRowAction.bind(null, r.row, r.year, r.module)} status={r.status} link={r.link} tab={r.tab}
                              label={label} defaultTab={DEFAULT_TAB[r.module]} />
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No years listed yet. Until one is added, Disbursement reads <code>{envSource("voucher").range}</code> and
                Collection reads <code>{envSource("collection").range}</code> from the spreadsheet set in <code>.env.local</code>.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a year</CardTitle>
            <CardDescription>
              Paste the spreadsheet&apos;s link and press Check: the app opens it with your Google account and shows what it
              finds before anything is saved. A year can use one spreadsheet for both modules (add it twice) or one for each.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddYear year={next} tabs={DEFAULT_TAB} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Starting a new year</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
              <li>In Google Drive, make a copy of last year&apos;s spreadsheet and clear its ledger rows. Its Selection List and layout settings come along.</li>
              <li>Share the copy with the same people as last year. Each spreadsheet&apos;s sharing is its access list.</li>
              <li>Add it above: paste the link, check the preview, and save.</li>
              <li>Set last year to Read-only, so closed books can&apos;t be edited by mistake.</li>
            </ol>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
