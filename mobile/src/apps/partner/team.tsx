import TeamScreen from "@/core/features/team/TeamScreen";
import { RequireRole } from "@/core/auth/RequireRole";

export default function Team() {
  return (
    <RequireRole roles={["BUSINESS"]}>
      <TeamScreen />
    </RequireRole>
  );
}
