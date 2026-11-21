import { useRef, useState, type ComponentRef } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Briefcase } from "lucide-react-native";
import { useAuth } from "../../auth/store";
import { Button, Field } from "../../ui";
import { useTheme } from "../../ui/theme";
import { toast } from "../../ui/toast";
import { APP_NAME, APP_VARIANT } from "../../config";

export default function LoginScreen() {
  const login = useAuth((s) => s.login);
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pwRef = useRef<ComponentRef<typeof TextInput>>(null);

  const isAdmin = APP_VARIANT === "admin";

  async function submit() {
    setError("");
    if (!/\S+@\S+\.\S+/.test(email.trim())) return setError("Enter a valid email address");
    if (!password) return setError("Enter your password");
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Signed in");
    } catch (e: any) {
      setError(e?.message || "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-slate-50 dark:bg-[#0B1120]">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "space-between",
          paddingTop: Math.max(insets.top + 16, 32),
          paddingBottom: Math.max(insets.bottom + 16, 24),
          paddingHorizontal: 20,
        }}
      >
        {/* Top Header / Brand */}
        <View className="items-center pt-2">
          <View className={`h-16 w-16 items-center justify-center rounded-2xl shadow-md ${isAdmin ? "bg-slate-900 shadow-slate-900/20 dark:bg-brand-600" : "bg-brand-600 shadow-brand-500/25"}`}>
            {isAdmin ? <ShieldCheck size={32} color="#fff" /> : <Briefcase size={30} color="#fff" />}
          </View>
          <Text className="mt-4 text-[26px] font-bold tracking-tight text-slate-900 dark:text-white">{APP_NAME}</Text>
          <Text className="mt-1 max-w-[280px] text-center text-[13px] leading-5 text-slate-500 dark:text-slate-400">
            {isAdmin
              ? "Platform control for administrators & managers."
              : "Leads, follow-ups & WhatsApp for business owners and sales teams."}
          </Text>
        </View>

        {/* Form Container (Centered towards bottom within thumb reach) */}
        <View className="my-auto w-full rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Text className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Sign In</Text>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => pwRef.current?.focus()}
            left={<Mail size={18} color={c.faint} />}
          />
          <Field
            ref={pwRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!show}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            left={<Lock size={18} color={c.faint} />}
            right={
              <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} accessibilityLabel={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff size={18} color={c.muted} /> : <Eye size={18} color={c.muted} />}
              </Pressable>
            }
          />
          {error ? (
            <View className="mb-3 rounded-xl bg-rose-50 p-3 dark:bg-rose-950">
              <Text className="text-[13px] text-rose-700 dark:text-rose-300">{error}</Text>
            </View>
          ) : null}
          <Button title="Sign in" size="lg" onPress={submit} loading={busy} full />
          <Link href="/forgot-password" asChild>
            <Pressable className="mt-3.5 items-center py-1.5" accessibilityRole="link">
              <Text className="text-[13px] font-semibold text-brand-600 dark:text-brand-300">Forgot password?</Text>
            </Pressable>
          </Link>
        </View>

        {/* Bottom Section: Role note & TBS logo */}
        <View className="items-center pt-2">
          <Text className="mb-4 text-center text-xs leading-4 text-slate-400 dark:text-slate-500">
            {isAdmin ? "Business owners & sales staff use the LeadFlow Partner app." : "Administrators use the LeadFlow Admin app."}
          </Text>
          <View className="items-center">
            <Text className="mb-4 text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">Developed by</Text>
            <Image
              source={require("../../../../assets/tbs-dark.jpg")}
              style={{ width: 110, height: 26 }}
              contentFit="contain"
              accessibilityLabel="Developed by TBS"
            />
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
