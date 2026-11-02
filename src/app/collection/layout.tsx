import { AppHeader } from "@/components/app-header"
import { AppShell } from "@/components/app-shell"
import { AppSidebar } from "@/components/app-sidebar"
import { getSession } from "@/lib/data"

export default async function CollectionLayout({ children }: LayoutProps<"/collection">) {
  const { user } = await getSession()
  return (
    <AppShell
      sidebar={<AppSidebar module="collection" sheetTitle="Collection Sheet" synced="Not connected yet" sheetUrl="" />}
      header={<AppHeader module="collection" user={user} />}
    >
      {children}
    </AppShell>
  )
}
