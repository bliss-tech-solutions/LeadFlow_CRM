import { AppRoot } from "@/core/AppRoot";
import { RootStack } from "@/core/navigation/RootStack";
export { RouteErrorBoundary as ErrorBoundary } from "@/core/ui";

/** LeadFlow Partner — business owners & sales staff. */
export default function PartnerLayout() {
  return (
    <AppRoot>
      <RootStack appScreens={["leads/[id]", "notifications", "settings", "analytics", "whatsapp", "calendar", "projects/[id]", "team"]} />
    </AppRoot>
  );
}
