import LeadsScreen from "@/core/features/leads/LeadsScreen";
import { useRole } from "@/core/auth/permissions";

export default function Leads() {
  const role = useRole();
  return <LeadsScreen title={role === "SALES" ? "My leads" : "Leads"} />;
}
