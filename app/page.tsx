import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCESS_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Root always redirects — never serve a page here (avoids stale cached dashboard HTML). */
export default function RootPage() {
  const authed = cookies().get(ACCESS_COOKIE)?.value === "1";
  redirect(authed ? "/app" : "/enter");
}
