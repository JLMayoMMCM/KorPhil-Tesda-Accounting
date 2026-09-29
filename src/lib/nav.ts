/** Only same-site paths ("/vouchers/?tab=paid"), never "//evil.com" or "https://…". */
export const safeNext = (url: string | null | undefined, fallback = "/") =>
  url && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : fallback
