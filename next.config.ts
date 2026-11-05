import type { NextConfig } from "next"

// The voucher pages moved under /voucher/; old bookmarks still land on them.
const LEGACY = ["dashboard", "workspace", "vouchers", "areas", "reports", "settings"]

const nextConfig: NextConfig = {
  // Keep the trailing-slash URLs (/auth/callback/) so the Google OAuth redirect URIs stay as registered.
  trailingSlash: true,
  // The Word downloads read the letterhead logos from disk; serverless functions don't get public/ otherwise.
  outputFileTracingIncludes: { "/*/reports/docx": ["./public/*_logo.png"] },
  async redirects() {
    return LEGACY.map((p) => ({ source: `/${p}/:path*`, destination: `/voucher/${p}/:path*`, permanent: false }))
  },
}

export default nextConfig
