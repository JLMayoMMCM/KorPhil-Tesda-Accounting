import { ClipboardCheckIcon, MapIcon, SheetIcon } from "lucide-react"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import Image from "next/image"
import { redirect } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { safeNext } from "@/lib/nav"
import { SESSION_COOKIE, unseal } from "@/lib/session"

export const metadata: Metadata = { title: "Sign in" }

const ERRORS: Record<string, string> = {
  state: "The sign-in link expired. Try again.",
  cancelled: "Google sign-in was cancelled.",
  google: "Google sign-in failed. Try again.",
  failed: "Couldn't finish signing in with Google. Try again.",
  unverified: "That Google account's email isn't verified.",
  scope: "Allow access to Google Sheets when Google asks. The app needs it to read and save vouchers.",
  expired: "Your Google session ended. Sign in again.",
}

const POINTS = [
  { Icon: ClipboardCheckIcon, title: "Audit-ready records.", text: "Every voucher is checked for a missing or duplicate DV #, a missing check # and missing tags." },
  { Icon: SheetIcon, title: "Edit once, saved to the sheet.", text: "Every change is written to the Google Sheet under your name." },
  { Icon: MapIcon, title: "Totals by trade area.", text: "Monthly, program and category splits you can download or print." },
]

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "")
  const code = one("error")
  const error = code === "access" ? `That Google account ${one("detail")}` : ERRORS[code] ?? (code ? ERRORS.failed : "")

  if (!error && (await unseal((await cookies()).get(SESSION_COOKIE)?.value))) redirect(safeNext(one("next")))

  const configured = !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  const h = await headers()
  const redirectUri = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/auth/callback/`

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel in the app shell's TESDA navy (the sidebar tokens), so sign-in and the workspace read as one place. */}
      <aside className="hidden flex-col justify-between gap-10 bg-sidebar p-10 text-sidebar-foreground lg:flex xl:p-14">
        <p className="font-semibold">KorPhil-TESDA <span className="font-normal text-sidebar-foreground/70">Disbursements</span></p>
        <div className="flex flex-col items-start gap-6">
          {/* The seal has white corners, so it sits on a white disc with a soft ring rather than straight on navy. */}
          <span className="rounded-full bg-white p-1.5 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)] ring-4 ring-white/15">
            <Image src="/logo.webp" alt="Korea-Philippines Vocational Training Center seal" width={168} height={168} priority className="rounded-full" />
          </span>
          <div className="flex flex-col gap-2">
            <h2 className="max-w-md font-heading text-3xl font-semibold tracking-tight text-balance xl:text-4xl">Korea-Philippines Vocational Training Center</h2>
            <p className="text-sidebar-foreground/70">Regional Training Center Davao</p>
          </div>
        </div>
        <ul className="flex max-w-md flex-col gap-4 border-t border-sidebar-foreground/15 pt-6 text-sm">
          {POINTS.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-sidebar-foreground/70" />
              <span><strong className="font-medium">{title}</strong> <span className="text-sidebar-foreground/70">{text}</span></span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex flex-col items-center justify-center gap-6 p-6">
        {/* Below lg the brand panel is hidden; keep the seal and name above the card. */}
        <div className="flex flex-col items-center gap-3 text-center lg:hidden">
          <Image src="/logo.webp" alt="Korea-Philippines Vocational Training Center seal" width={72} height={72} className="rounded-full" />
          <p className="font-semibold">KorPhil-TESDA <span className="font-normal text-muted-foreground">Disbursements</span></p>
        </div>
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Use the Google account the disbursement sheet is shared with.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {configured ? (
              <form method="post" action="/login/google/">
                <input type="hidden" name="next" value={one("next")} />
                <Button type="submit" variant="outline" size="lg" className="w-full">
                  <GoogleMark data-icon="inline-start" />
                  Continue with Google
                </Button>
              </form>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <p className="font-medium">Google sign-in isn&apos;t set up yet</p>
                <ol className="flex list-decimal flex-col gap-1 pl-5 text-muted-foreground">
                  <li>In Google Cloud Console, create an OAuth client of type <strong>Web application</strong>.</li>
                  <li>Add this authorized redirect URI: <code className="break-all">{redirectUri}</code></li>
                  <li>Put <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> in <code>.env.local</code> and restart.</li>
                </ol>
              </div>
            )}
          </CardContent>
          {configured && (
            <CardFooter>
              <p className="text-sm text-muted-foreground">
                No access yet? Ask the sheet&apos;s owner to share it with your Google account. Editors can save changes; viewers can only look.
              </p>
            </CardFooter>
          )}
        </Card>
        <p className="text-sm text-muted-foreground">Access follows the Google Sheet&apos;s sharing settings.</p>
      </main>
    </div>
  )
}

function GoogleMark(props: React.ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" {...props}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
