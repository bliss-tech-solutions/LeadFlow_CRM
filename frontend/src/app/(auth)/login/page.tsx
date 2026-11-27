import { redirect } from "next/navigation";

// Only the admin workspace can sign in here; sales and business-partner logins are turned off.
export default function LoginChooser() {
  redirect("/admin/login");
}
