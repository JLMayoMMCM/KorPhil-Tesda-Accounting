import { CircleAlertIcon, ExternalLinkIcon, PlugIcon, UnplugIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"

import { SyncButton } from "@/components/sync-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { clock, getData } from "@/lib/data"
import { fullName } from "@/lib/session"
import { CACHE_SECONDS, FIRST_ROW, SHEET_ID, SHEET_RANGE, sheetUrl } from "@/lib/sheets"

export const metadata: Metadata = { title: "Settings" }

export default async function Settings() {
  const { error, pull, user } = await getData()
  const open = (text: string) => sheetUrl && (
    <Button variant="outline" render={<a href={sheetUrl} target="_blank" rel="noopener" />} nativeButton={false}>
      {text}<ExternalLinkIcon data-icon="inline-end" />
    </Button>
  )
  const settings: [string, string, React.ReactNode, React.ReactNode?][] = [
    ["Google Sheet", "Every save writes back here.", <>
      <strong className="font-medium">{pull.title || "Untitled sheet"}</strong>
      {error
        ? <Badge variant="destructive"><UnplugIcon data-icon="inline-start" />Not connected</Badge>
        : <Badge variant="secondary"><PlugIcon data-icon="inline-start" />Connected through your Google account</Badge>}
    </>, open("Open sheet")],
    ["Sheet ID and range", "", <>
      <code className="break-all">{SHEET_ID || "Not set"}</code>
      <code>{SHEET_RANGE}!A:J</code>
      <span className="text-muted-foreground">Vouchers start on row {FIRST_ROW} (rows above hold the header and totals)</span>
    </>],
    ["Signed in as", "Reads and saves use this Google account.", <>
      <strong className="font-medium">{fullName(user)}</strong>
      <span className="text-muted-foreground">{user.email}</span>
    </>],
    ["Who can use the app", "Follows the sheet's own sharing.", <>
      <span className="inline-flex items-center gap-2"><UsersIcon className="size-4 shrink-0" />Anyone the sheet is shared with can sign in. Editors can save; viewers can only look.</span>
    </>, open("Manage sharing")],
    ["Auto-refresh", "How long a pull is reused before the next one.", <>Every {CACHE_SECONDS} seconds, or when you press Sync</>],
    ["Last sync", "", pull.at ? <>
      <span>{clock(pull.at)} · {pull.rows} rows</span>
      {error ? <Badge variant="destructive"><CircleAlertIcon data-icon="inline-start" />{error}</Badge> : <span className="text-muted-foreground">no errors</span>}
    </> : "Never", <SyncButton key="sync" />],
  ]

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Data source</CardTitle>
        <CardDescription>
          The Google Sheet this app reads from and writes back to. These values come from <code>.env.local</code> (or the
          Vercel project&apos;s environment variables); change them there and restart.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col">
          {settings.map(([term, hint, value, action], i) => (
            <div key={term}>
              {i > 0 && <Separator />}
              <div className="grid gap-2 py-4 md:grid-cols-[14rem_1fr_auto] md:items-center">
                <dt className="flex flex-col">
                  <span className="font-medium">{term}</span>
                  {hint && <small className="text-muted-foreground">{hint}</small>}
                </dt>
                <dd className="flex flex-wrap items-center gap-2 text-sm">{value}</dd>
                <dd>{action}</dd>
              </div>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
