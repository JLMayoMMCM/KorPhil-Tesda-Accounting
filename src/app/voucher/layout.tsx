import { AppHeader } from "@/components/app-header"
import { AppShell } from "@/components/app-shell"
import { AppSidebar } from "@/components/app-sidebar"
import { clock, getData } from "@/lib/data"
import { sheetUrl } from "@/lib/sheets"

export default async function VoucherLayout({ children }: LayoutProps<"/voucher">) {
  const { counts, pull, error, user, source, years } = await getData()
  const synced = clock(pull.at)
  return (
    <AppShell
      error={error}
      readOnlyYear={source.readOnly ? source.year : null}
      sidebar={
        <AppSidebar
          module="voucher"
          counts={counts}
          sheetTitle={pull.title}
          synced={synced ? `Synced ${synced} · ${pull.rows} rows` : "Not synced"}
          sheetUrl={sheetUrl(source.id)}
          years={years}
          year={source.year}
        />
      }
      header={<AppHeader module="voucher" user={user} synced={synced} readOnly={source.readOnly} />}
    >
      {children}
    </AppShell>
  )
}
