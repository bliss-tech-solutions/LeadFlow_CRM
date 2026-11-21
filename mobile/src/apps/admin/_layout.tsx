import { AppRoot } from "@/core/AppRoot";
import { RootStack } from "@/core/navigation/RootStack";
export { RouteErrorBoundary as ErrorBoundary } from "@/core/ui";

/** LeadFlow Admin — administrators & managers. */
export default function AdminLayout() {
  return (
    <AppRoot>
      <RootStack
        appScreens={["leads/[id]", "notifications", "settings", "analytics", "platform", "projects/[id]", "team", "businesses/[id]/index", "businesses/[id]/whatsapp", "webhooks", "meta-setup", "pipeline", "calendar", "spend"]}
      />
    </AppRoot>
  );
}
