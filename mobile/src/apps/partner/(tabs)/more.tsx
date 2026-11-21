import { BarChart3, Bell, CalendarDays, Settings, UserRound } from "lucide-react-native";
import MoreScreen, { type MoreItem } from "@/core/features/more/MoreScreen";
import { useRole } from "@/core/auth/permissions";
import { useTheme } from "@/core/ui/theme";
import { WhatsAppGlyph } from "@/core/features/whatsapp/WhatsAppGlyph";

export default function More() {
  const role = useRole();
  const { c } = useTheme();
  const isOwner = role === "BUSINESS";
  const items: MoreItem[] = [
    { href: "/calendar", label: "Calendar", icon: <CalendarDays size={18} color={c.brand} />, hint: "Month view with daily follow-up counts", section: "Work" },
    { href: "/analytics", label: isOwner ? "Business analytics" : "My performance", icon: <BarChart3 size={18} color={c.brand} />, hint: isOwner ? "Sources, conversion, team leaderboard" : "Your calls, wins and response time", section: "Work" },
    { href: "/whatsapp", label: "WhatsApp", icon: <WhatsAppGlyph size={18} color="#059669" />, hint: isOwner ? "Connection, templates, outbox" : "Connection status and templates", section: "Work" },
    ...(isOwner ? [{ href: "/team", label: "Sales team", icon: <UserRound size={18} color={c.brand} />, hint: "Add salespeople, block, assign projects", section: "Manage" }] : []),
    { href: "/notifications", label: "Notifications", icon: <Bell size={18} color={c.brand} />, section: "Account" },
    { href: "/settings", label: "Settings", icon: <Settings size={18} color={c.brand} />, hint: "Profile, password, notifications, app lock", section: "Account" },
  ];
  return <MoreScreen items={items} />;
}
