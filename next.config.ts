import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Keep the legacy URLs (/vouchers/, /auth/callback/) so the Google OAuth redirect URIs stay as registered.
  trailingSlash: true,
}

export default nextConfig
