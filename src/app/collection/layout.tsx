import { AppHeader } from "@/components/app-header"
import { AppShell } from "@/components/app-shell"
import { AppSidebar } from "@/components/app-sidebar"
import { clock, getCollectionData } from "@/lib/data"
import { sheetUrl } from "@/lib/sheets"

export default async function CollectionLayout({ children }: LayoutProps<"/collection">) {
  const { at, title, entries, error, user, source } = await getCollectionData()
  const synced = clock(at)
  return (
    <AppShell
      error={error}
      readOnlyYear={source.readOnly ? source.year : null}
      sidebar={
        <AppSidebar
          module="collection"
          sheetTitle={title || "Collection Sheet"}
          synced={synced ? `Synced ${synced} · ${entries.length} entries` : "Not synced"}
          sheetUrl={sheetUrl(source.id)}
          year={source.year}
        />
      }
      header={<AppHeader module="collection" user={user} synced={synced} readOnly={source.readOnly} />}
    >
      {children}
    </AppShell>
  )
}
