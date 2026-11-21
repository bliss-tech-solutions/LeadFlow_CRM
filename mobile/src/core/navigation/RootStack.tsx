import { Stack } from "expo-router";
import { useAuth } from "../auth/store";
import { useTheme } from "../ui/theme";
import { AfterCallSheet } from "../features/calls/callFlow";
import { WhatsAppComposer } from "../features/whatsapp/Composer";
import { Loading } from "../ui";

/**
 * Shared navigator for both apps. Signed-out users can only reach the auth
 * screens; everything else is behind Stack.Protected.
 */
export function RootStack({ appScreens }: { appScreens: string[] }) {
  const status = useAuth((s) => s.status);
  const { c } = useTheme();
  if (status === "booting") return <Loading />;
  const signedIn = status === "signedIn";

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "slide_from_right" }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" options={{ animation: "fade" }} />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          {appScreens.map((name) => (
            <Stack.Screen key={name} name={name} />
          ))}
        </Stack.Protected>
      </Stack>
      {signedIn ? (
        <>
          <AfterCallSheet />
          <WhatsAppComposer />
        </>
      ) : null}
    </>
  );
}
