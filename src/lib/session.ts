// Sign-in session: one encrypted (A256GCM) HttpOnly cookie holding the Google user and tokens. No database.
// Pure seal/unseal so proxy.ts and route handlers can both use it.
import { base64url, EncryptJWT, jwtDecrypt } from "jose"

export const SESSION_COOKIE = "session"
export const STATE_COOKIE = "oauth_state"
export const TOKEN_URL = "https://oauth2.googleapis.com/token"
const MAX_AGE = 60 * 60 * 24 * 30 // the refresh token keeps it alive; Google revoking it ends it sooner

export type GoogleUser = { email: string; first_name: string; last_name: string; picture: string }
export type Session = { user: GoogleUser; access_token: string; refresh_token?: string; expires_at: number }

function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error("Set SESSION_SECRET: sessions are encrypted with it.")
  return base64url.decode(secret)
}

export async function seal(value: object, maxAge = MAX_AGE): Promise<string> {
  return new EncryptJWT({ v: value })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .encrypt(key())
}

export async function unseal<T>(token: string | undefined): Promise<T | null> {
  if (!token) return null
  try {
    return (await jwtDecrypt(token, key())).payload.v as T
  } catch {
    return null
  }
}

export const cookieOptions = (maxAge = MAX_AGE) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
})

export const fullName = (u: GoogleUser) => `${u.first_name} ${u.last_name}`.trim() || u.email

/** Google token response -> session tokens, keeping the old refresh token when Google doesn't send a new one. */
export function withTokens(user: GoogleUser, payload: Record<string, unknown>, refreshToken?: string): Session {
  return {
    user,
    access_token: String(payload.access_token),
    refresh_token: (payload.refresh_token as string | undefined) ?? refreshToken,
    expires_at: Date.now() / 1000 + Number(payload.expires_in ?? 3600),
  }
}

/** Refresh an access token about to expire. Returns the updated session, the same one if still fresh, or null. */
export async function refreshed(s: Session): Promise<Session | null> {
  if (s.expires_at - Date.now() / 1000 >= 60) return s
  if (!s.refresh_token) return null
  try {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        refresh_token: s.refresh_token,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    return withTokens(s.user, await response.json(), s.refresh_token)
  } catch {
    return null
  }
}

/** Must match the OAuth client's authorized redirect URI exactly (trailing slash included). */
export const redirectUri = (request: Request) => new URL("/auth/callback/", request.url).toString()
