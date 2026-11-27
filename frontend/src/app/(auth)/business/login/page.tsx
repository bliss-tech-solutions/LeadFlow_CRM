import { redirect } from "next/navigation";

// Business-partner login is turned off — only the admin login is available.
export default function BusinessLogin() {
  redirect("/admin/login");
}
