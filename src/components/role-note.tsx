import type { BookRoles } from "@/lib/sheet-config"

/** Where the Role choices come from (the Selection List's roles table), and anything in it the app can't use. */
export function RoleNote({ roles, labels }: { roles: BookRoles<string>; labels: Record<string, string> }) {
  if (!roles.table) return <p className="text-sm text-muted-foreground">No roles table in the Selection List, so every field the app knows is offered as a role.</p>
  const required = roles.roles.filter((r) => roles.absent.includes(r.field))
  const missing = roles.absent.filter((f) => !required.some((r) => r.field === f))
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="text-muted-foreground">
        Roles come from the <span className="font-medium text-foreground">{roles.table}</span> column of the Selection List; each
        role can be on one column only. Dropdown choices come from the Selection List column with the role&apos;s name.
      </p>
      {required.length > 0 && (
        <p className="text-destructive">
          Not in {roles.table}, offered anyway because the app needs them: {required.map((r) => r.label).join(", ")}. Add them to the sheet.
        </p>
      )}
      {missing.length > 0 && (
        <p className="text-muted-foreground">Not in {roles.table}, so not offered (still found by header text): {missing.map((f) => labels[f] ?? f).join(", ")}.</p>
      )}
      {roles.custom.length > 0 && (
        <p className="text-muted-foreground">
          Custom roles (not fields the app knows, read as named columns): {roles.custom.join(", ")}. Auto finds them by header text.
        </p>
      )}
    </div>
  )
}
