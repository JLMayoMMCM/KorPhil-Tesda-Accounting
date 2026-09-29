/** Only same-site paths ("/vouchers/?tab=paid"), never "//evil.com" or "https://…". */
/** Where sign-in lands when there's no page to return to. */
export const HOME = "/dashboard/"

export const safeNext = (url: string | null | undefined, fallback = HOME) =>
  url && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : fallback
