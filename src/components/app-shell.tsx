import { CircleAlertIcon } from "lucide-react"
import { cookies } from "next/headers"

import { signOut } from "@/app/actions"
import { AppUI } from "@/components/app-ui"
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { SIGN_IN_AGAIN } from "@/lib/sheets"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"

type Props = { sidebar: React.ReactNode; header: React.ReactNode; error?: string | null; children: React.ReactNode }

/** The sidebar-and-header frame every module renders its pages in. */
export async function AppShell({ sidebar, header, error, children }: Props) {
  // The sidebar writes this cookie on toggle; reading it keeps the rail collapsed across reloads.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"
  // Toast and tooltip live here, not in the root layout, so /login ships no Base UI.
  return (
    <TooltipProvider>
      <Toaster>
        <AppUI>
          <SidebarProvider defaultOpen={sidebarOpen}>
            {sidebar}
            <SidebarInset className="min-w-0">
              {header}
              {error && (
                <Alert variant="destructive" className="mx-4 mt-4 w-auto">
                  <CircleAlertIcon />
                  <AlertDescription>{error}</AlertDescription>
                  {/* The token was revoked or went bad mid-session: signing out clears it and lands on the sign-in page. */}
                  {error.endsWith(SIGN_IN_AGAIN) && (
                    <AlertAction>
                      <form action={signOut}><Button type="submit" size="sm" variant="outline">Sign in again</Button></form>
                    </AlertAction>
                  )}
                </Alert>
              )}
              <div className="flex flex-1 flex-col p-4 print:p-0">{children}</div>
            </SidebarInset>
          </SidebarProvider>
        </AppUI>
      </Toaster>
    </TooltipProvider>
  )
}
