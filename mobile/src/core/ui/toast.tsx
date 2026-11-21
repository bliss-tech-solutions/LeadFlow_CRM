import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { create } from "zustand";
import { AlertTriangle, BellRing, CheckCircle2, XCircle } from "lucide-react-native";

type Tone = "info" | "success" | "warn" | "error";
type ToastItem = { id: number; tone: Tone; title: string; message?: string; onPress?: () => void };

const useToasts = create<{ items: ToastItem[]; push: (t: Omit<ToastItem, "id">) => void; dismiss: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ items: [...s.items, { ...t, id }].slice(-3) }));
    setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), t.tone === "error" ? 6000 : 4000);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

function haptic(tone: Tone) {
  const type =
    tone === "success" ? Haptics.NotificationFeedbackType.Success : tone === "error" ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning;
  Haptics.notificationAsync(type).catch(() => undefined);
}

export const toast = {
  info: (title: string, message?: string, onPress?: () => void) => useToasts.getState().push({ tone: "info", title, message, onPress }),
  success: (title: string, message?: string) => {
    haptic("success");
    useToasts.getState().push({ tone: "success", title, message });
  },
  warn: (title: string, message?: string) => {
    haptic("warn");
    useToasts.getState().push({ tone: "warn", title, message });
  },
  error: (title: string, message?: string) => {
    haptic("error");
    useToasts.getState().push({ tone: "error", title, message });
  },
};

const ICON = { info: BellRing, success: CheckCircle2, warn: AlertTriangle, error: XCircle };
const ACCENT = { info: "#4F46E5", success: "#16A34A", warn: "#D97706", error: "#E11D48" };

/** Mounted once at the root of each app. */
export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  useEffect(() => undefined, []);

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + 8, left: 12, right: 12, zIndex: 1000 }}>
      {items.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <Animated.View key={t.id} entering={FadeInUp.springify().damping(18)} exiting={FadeOutUp}>
            <Pressable
              accessibilityRole="alert"
              onPress={() => {
                dismiss(t.id);
                t.onPress?.();
              }}
              className="mb-2 flex-row items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
            >
              <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${ACCENT[t.tone]}1A` }}>
                <Icon size={18} color={ACCENT[t.tone]} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-slate-900 dark:text-slate-100" numberOfLines={1}>
                  {t.title}
                </Text>
                {t.message ? (
                  <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" numberOfLines={2}>
                    {t.message}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
