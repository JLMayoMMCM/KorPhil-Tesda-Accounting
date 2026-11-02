import { redirect } from "next/navigation"

import { VOUCHER_HOME } from "@/lib/nav"

/** "/voucher/" is the voucher Dashboard. */
export default function VoucherRoot() {
  redirect(VOUCHER_HOME)
}
