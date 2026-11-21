import { Building2, CalendarClock, Home, Menu, Users } from "lucide-react-native";
import { AppTabs } from "@/core/navigation/tabs";
import { useRole } from "@/core/auth/permissions";

export default function PartnerTabs() {
  const role = useRole();
  return (
    <AppTabs
      tabs={[
        { name: "index", title: "Home", Icon: Home, show: true },
        { name: "leads", title: role === "SALES" ? "My leads" : "Leads", Icon: Users, show: true },
        { name: "followups", title: "Follow-ups", Icon: CalendarClock, show: true },
        { name: "projects", title: "Projects", Icon: Building2, show: true },
        { name: "more", title: "More", Icon: Menu, show: true },
      ]}
    />
  );
}
