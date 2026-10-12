import { redirect } from "next/navigation"

import { HOME } from "@/lib/nav"

/** "/" is the Dashboard. */
export default function Root() {
  redirect(HOME)
}
