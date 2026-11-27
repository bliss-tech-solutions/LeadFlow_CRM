import { redirect } from "next/navigation";

// Sales login is turned off — only the admin login is available.
export default function SalesLogin() {
  redirect("/admin/login");
}
