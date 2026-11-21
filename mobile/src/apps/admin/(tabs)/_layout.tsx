import { Building2, CalendarClock, LayoutDashboard, Menu, Users } from "lucide-react-native";
import { AppTabs } from "@/core/navigation/tabs";

export default function AdminTabs() {
  return (
    <AppTabs
      tabs={[
        { name: "index", title: "Dashboard", Icon: LayoutDashboard, show: true },
        { name: "leads", title: "Leads", Icon: Users, show: true },
        { name: "businesses", title: "Businesses", Icon: Building2, show: true },
        { name: "followups", title: "Follow-ups", Icon: CalendarClock, show: true },
        { name: "more", title: "More", Icon: Menu, show: true },
      ]}
    />
  );
}
