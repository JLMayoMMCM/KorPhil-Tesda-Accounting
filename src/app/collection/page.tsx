import { redirect } from "next/navigation"

import { COLLECTION_HOME } from "@/lib/nav"

/** "/collection/" is the collection Dashboard. */
export default function CollectionRoot() {
  redirect(COLLECTION_HOME)
}
