import { CircleAlertIcon } from "lucide-react"
import { cookies } from "next/headers"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { AppUI } from "@/components/app-ui"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { clock, getData } from "@/lib/data"
import { sheetUrl } from "@/lib/sheets"

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { counts, pull, error, user } = await getData()
  const synced = clock(pull.at)
  // The sidebar writes this cookie on toggle; reading it keeps the rail collapsed across reloads.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"
  return (
    <AppUI>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <AppSidebar
          counts={counts}
          sheetTitle={pull.title}
          synced={synced ? `Synced ${synced} · ${pull.rows} rows` : "Not synced"}
          sheetUrl={sheetUrl}
        />
        <SidebarInset>
          <AppHeader user={user} synced={synced} />
          {error && (
            <Alert variant="destructive" className="mx-4 mt-4 w-auto">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-1 flex-col p-4">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AppUI>
  )
}
