/** Where sign-in lands when there's no page to return to. */
export const HOME = "/dashboard/"

/** Only same-site paths ("/vouchers/?tab=review"), never "//evil.com" or "https://…". */
export const safeNext = (url: string | null | undefined, fallback = HOME) =>
  url && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : fallback
