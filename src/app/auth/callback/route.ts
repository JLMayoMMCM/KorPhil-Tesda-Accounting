import { createRemoteJWKSet, jwtVerify } from "jose"
import { NextResponse, type NextRequest } from "next/server"

import { safeNext } from "@/lib/nav"
import { cookieOptions, redirectUri, seal, SESSION_COOKIE, STATE_COOKIE, TOKEN_URL, unseal, withTokens } from "@/lib/session"
import { checkAccess } from "@/lib/sheets"

// Same 10 s budget as the other Google calls (jose's default is 5 s).
const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { timeoutDuration: 10_000 })

/** Google redirects here after sign-in. The sheet's sharing is the access list. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const saved = await unseal<{ state: string; next: string }>(request.cookies.get(STATE_COOKIE)?.value)

  const fail = (error: string, detail = "") => {
    const url = new URL("/login/", request.url)
    url.searchParams.set("error", error)
    if (detail) url.searchParams.set("detail", detail)
    const response = NextResponse.redirect(url)
    response.cookies.delete(STATE_COOKIE)
    return response
  }

  if (!saved || saved.state !== params.get("state")) return fail("state")
  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "cancelled" : "google")

  let payload: Record<string, string>
  let claims: Record<string, unknown>
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        code: params.get("code") ?? "",
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri(request),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`token ${response.status}: ${await response.text()}`)
    payload = await response.json()
    claims = (await jwtVerify(payload.id_token, GOOGLE_KEYS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    })).payload
  } catch (exc) {
    console.error("Google sign-in failed:", exc)
    return fail("failed")
  }

  if (!claims.email_verified) return fail("unverified")
  if (!String(payload.scope ?? "").includes("spreadsheets")) return fail("scope")
  const accessError = await checkAccess(payload.access_token)
  if (accessError) return fail("access", accessError)

  const user = {
    email: String(claims.email ?? ""),
    first_name: String(claims.given_name ?? ""),
    last_name: String(claims.family_name ?? ""),
    picture: String(claims.picture ?? ""),
  }
  const response = NextResponse.redirect(new URL(safeNext(saved.next), request.url))
  response.cookies.delete(STATE_COOKIE)
  response.cookies.set(SESSION_COOKIE, await seal(withTokens(user, payload)), cookieOptions())
  return response
}
