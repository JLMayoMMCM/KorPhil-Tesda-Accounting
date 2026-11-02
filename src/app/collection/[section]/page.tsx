import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { MODULES } from "@/lib/nav"

/** What each placeholder section will hold; a section gets its own folder once it's built. */
const TEXT: Record<string, string> = {
  collections: "Record collections and official receipts here.",
  reports: "Collection reports will be generated here.",
  settings: "Connect the collection Google Sheet here.",
}

const find = (section: string) =>
  TEXT[section] ? { ...MODULES.collection.nav.find((i) => i.href === `/collection/${section}/`)!, text: TEXT[section] } : null

export async function generateMetadata({ params }: PageProps<"/collection/[section]">): Promise<Metadata> {
  return { title: `${find((await params).section)?.title ?? "Not found"} · Collections` }
}

export default async function CollectionSection({ params }: PageProps<"/collection/[section]">) {
  const section = find((await params).section)
  if (!section) notFound()
  const Icon = section.icon
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon /></EmptyMedia>
        <EmptyTitle className="flex items-center gap-2">{section.title}<Badge variant="secondary">Coming soon</Badge></EmptyTitle>
        <EmptyDescription>{section.text}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
