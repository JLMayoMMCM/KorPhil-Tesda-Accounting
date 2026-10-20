import { CircleAlertIcon, EyeIcon, PencilIcon } from "lucide-react"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import Image from "next/image"
import { redirect } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { safeNext } from "@/lib/nav"
import { SESSION_COOKIE, unseal } from "@/lib/session"

import { GoogleButton } from "./google-button"
import { SealRings } from "./seal-rings"

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

const SEAL_ALT = "Korea-Philippines Vocational Training Center seal"

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
    <div data-rings className="relative isolate grid min-h-svh grid-rows-[auto_1fr] overflow-hidden bg-linear-to-b from-sidebar to-[color-mix(in_oklch,var(--sidebar),black_18%)] text-sidebar-foreground selection:bg-white/25 lg:grid-cols-2 lg:grid-rows-1">
      {/* The whole page is the app shell's TESDA navy (the sidebar tokens) and the sign-in card is the one white surface,
          the same relationship as the workspace's sidebar and its pages. Below lg the brand is a short band above the card. */}
      <aside className="flex flex-col gap-6 px-4 py-5 sm:px-8 lg:justify-between lg:gap-10 lg:p-10 xl:p-14">
        <div className="flex items-center gap-3">
          {/* The seal has white corners, so it sits on a white disc. */}
          <span className="block size-8 rounded-full bg-white p-0.5 lg:hidden">
            <Image src="/tesda_korphil_logo.png" alt={SEAL_ALT} width={32} height={32} loading="eager" className="size-full rounded-full" />
          </span>
          <p className="font-semibold">KorPhil-TESDA <span className="font-normal text-sidebar-foreground/70">Disbursements</span></p>
        </div>

        <div className="flex flex-col items-start gap-7">
          <span className="relative hidden size-28 rounded-full bg-white p-1.5 ring-4 ring-white/15 lg:block lg:[@media(min-height:52rem)]:size-36">
            <SealRings />
            <Image src="/tesda_korphil_logo.png" alt={SEAL_ALT} width={144} height={144} loading="eager" className="size-full rounded-full" />
          </span>
          <p className="max-w-md font-heading text-3xl leading-[1.05] font-semibold tracking-tight text-balance lg:text-5xl">
            Every voucher, <span className="text-sidebar-foreground/60">accounted for.</span>
          </p>
        </div>

        {/* The centre's name sits under a 2px rule, the way a ledger closes a total. */}
        <p className="hidden max-w-md border-t-2 border-sidebar-foreground pt-4 text-sm leading-relaxed text-sidebar-foreground/70 lg:block">
          <span className="block font-medium text-sidebar-foreground">Korea-Philippines Vocational Training Center</span>
          Regional Training Center Davao
        </p>
      </aside>

      <main className="flex flex-col px-4 pb-8 sm:px-8 lg:justify-center lg:py-10 lg:pr-10 lg:pl-0 xl:pr-14">
        {/* A web approximation of liquid glass (Apple ships none for the web): a bright, milky pane inside a thin clear rim (the translucent border) that catches light at two corners, with a lit top edge, a navy-tinted bevel
            inside the other edges, soft uneven corners and one specular glint. Solid white when transparency is reduced.
            Secondary text is foreground/75 because muted-foreground drops under AA where the navy shows through. */}
        <div className="relative isolate flex w-full max-w-xl flex-col gap-6 rounded-[2.75rem_2.25rem_3rem_2.5rem] border-[3px] border-white/20 bg-linear-to-br from-white/90 to-white/[0.72] bg-clip-padding p-7 text-card-foreground shadow-[0_0_0_1px_rgb(255_255_255/0.2),inset_0_2px_1px_rgb(255_255_255),inset_0_-20px_30px_-20px_rgb(35_42_124/0.22),inset_14px_0_24px_-18px_rgb(35_42_124/0.12),inset_-14px_0_24px_-18px_rgb(35_42_124/0.16),0_30px_60px_-30px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150 selection:bg-sidebar/15 sm:p-9 lg:p-11 [@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:bg-none">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] bg-[radial-gradient(45%_35%_at_10%_0%,white,transparent)]" />
          {/* Specular rim: light catches the top-left and bottom-right of the edge and falls away between. The mask keeps only the 3px ring. */}
          <div aria-hidden="true" className="pointer-events-none absolute -inset-[3px] rounded-[inherit] bg-[linear-gradient(135deg,white,rgb(255_255_255/0.25)_22%,rgb(255_255_255/0)_45%,rgb(255_255_255/0)_60%,rgb(255_255_255/0.3)_82%,white)] p-[3px] [mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]" />
          <div className="flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-balance">Sign in to Disbursements</h1>
            <p className="text-sm text-pretty text-foreground/75">Use the Google account the disbursement sheet is shared with.</p>
          </div>

          {error && (
            <Alert variant="destructive" className="rounded-2xl border-destructive/40">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {configured ? (
            <form method="post" action="/login/google/" className="flex flex-col gap-4">
              <input type="hidden" name="next" value={one("next")} />
              <GoogleButton />
              {/* The scope error already says this. */}
              {code !== "scope" && (
                <p className="text-xs text-pretty text-foreground/75">Google will ask for access to Google Sheets. The app needs it to read and save vouchers.</p>
              )}
            </form>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <h2 className="font-medium">Google sign-in isn&apos;t set up yet</h2>
              <ol className="flex list-decimal flex-col gap-1 pl-5 text-foreground/75">
                <li>In Google Cloud Console, create an OAuth client of type <strong>Web application</strong>.</li>
                <li>Add this authorized redirect URI: <code className="break-all">{redirectUri}</code></li>
                <li>Put <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> in <code>.env.local</code> and restart.</li>
              </ol>
            </div>
          )}

          <section className="flex flex-col gap-3 border-t border-foreground/15 pt-6 text-sm">
            <h2 className="font-medium">Access follows the Google Sheet&apos;s sharing settings.</h2>
            {configured && (
              <>
                <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-foreground/75">
                  <dt className="flex items-center gap-2 font-medium"><PencilIcon aria-hidden="true" className="size-3.5 text-foreground/75" />Editors</dt>
                  <dd>can save changes</dd>
                  <dt className="flex items-center gap-2 font-medium"><EyeIcon aria-hidden="true" className="size-3.5 text-foreground/75" />Viewers</dt>
                  <dd>can only look</dd>
                </dl>
                <p className="text-pretty text-foreground/75">No access yet? Ask the sheet&apos;s owner to share it with your Google account.</p>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
