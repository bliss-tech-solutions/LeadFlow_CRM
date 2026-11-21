import { Activity, BarChart3, Bell, CalendarDays, FlaskConical, IndianRupee, KanbanSquare, Settings, UserRound, Webhook } from "lucide-react-native";
import MoreScreen, { type MoreItem } from "@/core/features/more/MoreScreen";
import { useTheme } from "@/core/ui/theme";

export default function More() {
  const { c } = useTheme();
  const items: MoreItem[] = [
    { href: "/pipeline", label: "Pipeline", icon: <KanbanSquare size={18} color={c.brand} />, hint: "Every lead by stage", section: "Leads" },
    { href: "/calendar", label: "Calendar", icon: <CalendarDays size={18} color={c.brand} />, hint: "Month view with daily follow-up counts", section: "Leads" },
    { href: "/analytics", label: "Analytics", icon: <BarChart3 size={18} color={c.brand} />, hint: "Sources, conversion, leaderboard", section: "Leads" },
    { href: "/team", label: "Sales team", icon: <UserRound size={18} color={c.brand} />, hint: "Create, block, projects, daily limits", section: "Manage" },
    { href: "/spend", label: "Ad Spend", icon: <IndianRupee size={18} color={c.brand} />, hint: "CPL, campaign budget tracker", section: "Insights" },
    { href: "/platform", label: "Platform health", icon: <Activity size={18} color={c.brand} />, hint: "Ingestion, backlog, WhatsApp", section: "Platform" },
    { href: "/webhooks", label: "Webhook log", icon: <Webhook size={18} color={c.brand} />, section: "Platform" },
    { href: "/meta-setup", label: "Meta & LeadSync setup", icon: <FlaskConical size={18} color={c.brand} />, section: "Platform" },
    { href: "/notifications", label: "Notifications", icon: <Bell size={18} color={c.brand} />, section: "Account" },
    { href: "/settings", label: "Settings", icon: <Settings size={18} color={c.brand} />, section: "Account" },
  ];
  return <MoreScreen items={items} />;
}
