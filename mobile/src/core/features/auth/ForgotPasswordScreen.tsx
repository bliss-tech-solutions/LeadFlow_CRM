import { useState } from "react";
import { Text, View } from "react-native";
import { Mail, CheckCircle2 } from "lucide-react-native";
import { api } from "../../api/client";
import { Button, Field, Screen } from "../../ui";
import { useTheme } from "../../ui/theme";

export default function ForgotPasswordScreen() {
  const { c } = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!/\S+@\S+\.\S+/.test(email.trim())) return setError("Enter a valid email address");
    setBusy(true);
    try {
      const r = await api<{ message: string }>("/auth/forgot-password", { method: "POST", auth: false, body: { email: email.trim().toLowerCase() } });
      setSent(r.message);
    } catch (e: any) {
      setError(e?.message || "Could not send reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Reset password" back subtitle="We'll email you a secure link to choose a new password.">
      {sent ? (
        <View className="mt-4 flex-row items-start gap-3 rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950">
          <CheckCircle2 size={20} color="#16A34A" />
          <Text className="flex-1 text-[14px] leading-5 text-emerald-800 dark:text-emerald-200">{sent}</Text>
        </View>
      ) : (
        <View className="mt-4">
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@company.com" left={<Mail size={18} color={c.faint} />} error={error} onSubmitEditing={submit} />
          <Button title="Send reset link" size="lg" onPress={submit} loading={busy} full />
          <Text className="mt-4 text-center text-xs text-slate-500">The link opens in your browser and expires in 30 minutes.</Text>
        </View>
      )}
    </Screen>
  );
}
