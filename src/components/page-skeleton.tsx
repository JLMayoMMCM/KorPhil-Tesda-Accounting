import { Skeleton } from "@/components/ui/skeleton"

const rows = (n: number, className: string) => Array.from({ length: n }, (_, i) => <Skeleton key={i} className={className} />)

/** Shown by each route's loading.tsx while the page's data loads: the page's rough shape, not its exact layout. */
export function PageSkeleton({ variant = "table" }: { variant?: "table" | "dashboard" | "reports" | "settings" }) {
  return (
    <div role="status" aria-label="Loading" className="flex w-full flex-col gap-4">
      {variant === "table" && (
        <>
          <div className="flex items-center gap-2 border-b pb-2">
            {[64, 80, 72].map((w) => <Skeleton key={w} className="h-7" style={{ width: w }} />)}
            <Skeleton className="ml-auto h-8 w-56" />
          </div>
          <Skeleton className="ml-auto h-5 w-72" />
          <div className="flex flex-col gap-3">{rows(10, "h-12")}</div>
        </>
      )}
      {variant === "dashboard" && (
        <>
          <Skeleton className="h-8 w-48" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{rows(4, "h-24 rounded-xl")}</div>
          <div className="grid gap-4 lg:grid-cols-12">
            <Skeleton className="h-80 rounded-xl lg:col-span-5" />
            <Skeleton className="h-80 rounded-xl lg:col-span-7" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </>
      )}
      {variant === "reports" && (
        <>
          <Skeleton className="h-8 w-full max-w-xl" />
          <div className="flex gap-2"><Skeleton className="h-8 w-32" /><Skeleton className="h-8 w-20" /></div>
          <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
            <div className="hidden flex-col gap-2 lg:flex">{rows(8, "h-7")}</div>
            <Skeleton className="aspect-[8.5/11] w-full max-w-3xl rounded-xl" />
          </div>
        </>
      )}
      {variant === "settings" && (
        <div className="flex max-w-4xl flex-col gap-4">{rows(3, "h-48 rounded-xl")}</div>
      )}
    </div>
  )
}
