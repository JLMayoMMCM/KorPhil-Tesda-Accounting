import type { Metadata } from "next"
import { Geist_Mono, IBM_Plex_Sans } from "next/font/google"
import "./globals.css"
import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-sans" })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: { template: "%s · KorPhil-TESDA", default: "Disbursements · KorPhil-TESDA" },
  description: "Disbursement voucher workspace for the Korea-Philippines Vocational Training Center.",
  icons: { icon: "/logo.webp" },
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn("h-full antialiased font-sans", geistMono.variable, ibmPlexSans.variable)}>
      <body className="min-h-full">
        <TooltipProvider>
          <Toaster>{children}</Toaster>
        </TooltipProvider>
      </body>
    </html>
  )
}
