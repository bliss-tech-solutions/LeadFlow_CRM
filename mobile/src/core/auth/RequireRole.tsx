import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react-native";
import { useAuth, type Role } from "./store";
import { EmptyState, Screen } from "../ui";

/**
 * Route-level guard: renders the screen only for allowed roles. Deep links or
 * notifications can't open a screen the user isn't allowed to see (and the API
 * would refuse the data anyway).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const role = useAuth((s) => s.user?.role);
  if (!role || !roles.includes(role)) {
    return (
      <Screen back title="">
        <EmptyState icon={<ShieldAlert size={28} color="#E11D48" />} title="No access" message="Your role doesn't include this screen. Ask your administrator if you need it." />
      </Screen>
    );
  }
  return <>{children}</>;
}
