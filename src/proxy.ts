import { NextResponse, type NextRequest } from "next/server"

import { cookieOptions, refreshed, seal, SESSION_COOKIE, unseal, type Session } from "@/lib/session"

/**
 * Every app request needs a signed-in Google user. The access token is refreshed here when it is
 * about to expire, because Server Components can't write cookies; the new cookie is set on both the
 * forwarded request (so this render sees it) and the response.
 */
export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value
  const session = await unseal<Session>(cookie)
  const next = request.nextUrl.pathname + request.nextUrl.search
  const login = new URL(`/login/?next=${encodeURIComponent(next)}`, request.url)

  if (!session) return NextResponse.redirect(login)

  const fresh = await refreshed(session)
  if (!fresh) {
    login.searchParams.set("error", "expired")
    const response = NextResponse.redirect(login)
    response.cookies.delete(SESSION_COOKIE)
    return response
  }
  if (fresh === session) return NextResponse.next()

  const value = await seal(fresh)
  request.cookies.set(SESSION_COOKIE, value)
  const response = NextResponse.next({ request })
  response.cookies.set(SESSION_COOKIE, value, cookieOptions())
  return response
}

export const config = {
  // Everything except sign-in routes, Next internals and public files.
  matcher: ["/((?!login|auth/callback|_next/|favicon.ico|logo.webp).*)"],
}
