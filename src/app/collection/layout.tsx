import { AppHeader } from "@/components/app-header"
import { AppShell } from "@/components/app-shell"
import { AppSidebar } from "@/components/app-sidebar"
import { clock, getCollectionData } from "@/lib/data"
import { collectionSheetUrl } from "@/lib/sheets"

export default async function CollectionLayout({ children }: LayoutProps<"/collection">) {
  const { at, title, entries, error, user } = await getCollectionData()
  const synced = clock(at)
  return (
    <AppShell
      error={error}
      sidebar={
        <AppSidebar
          module="collection"
          sheetTitle={title || "Collection Sheet"}
          synced={synced ? `Synced ${synced} · ${entries.length} entries` : "Not synced"}
          sheetUrl={collectionSheetUrl}
        />
      }
      header={<AppHeader module="collection" user={user} synced={synced} />}
    >
      {children}
    </AppShell>
  )
}
