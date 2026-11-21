import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useAuth } from "../../auth/store";
import { Avatar, Card, Screen, SectionTitle } from "../../ui";
import { useTheme } from "../../ui/theme";

export type MoreItem = { href: string; label: string; icon: ReactNode; hint?: string; section: string };

/** Role-filtered menu for everything that doesn't fit in the tab bar. */
export default function MoreScreen({ items }: { items: MoreItem[] }) {
  const { c } = useTheme();
  const user = useAuth((s) => s.user);
  const sections = [...new Set(items.map((i) => i.section))];

  return (
    <Screen title="More">
      <Card className="mt-1 flex-row items-center gap-3" onPress={() => router.push("/settings")}>
        <Avatar name={user?.name} uri={user?.profilePhotoUrl} size={48} />
        <View className="flex-1">
          <Text className="text-[16px] font-semibold text-slate-900 dark:text-white">{user?.name}</Text>
          <Text className="text-[13px] text-slate-500">{user?.email}</Text>
        </View>
        <ChevronRight size={18} color={c.faint} />
      </Card>
      {sections.map((s) => (
        <View key={s}>
          <SectionTitle>{s}</SectionTitle>
          <Card className="py-1">
            {items
              .filter((i) => i.section === s)
              .map((i, idx, arr) => (
                <Pressable
                  key={i.href}
                  onPress={() => router.push(i.href as any)}
                  accessibilityRole="button"
                  className={`min-h-[56px] flex-row items-center gap-3 py-2 active:opacity-70 ${idx < arr.length - 1 ? "border-b border-slate-100 dark:border-slate-800" : ""}`}
                >
                  <View className="h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">{i.icon}</View>
                  <View className="flex-1">
                    <Text className="text-[15px] text-slate-800 dark:text-slate-200">{i.label}</Text>
                    {i.hint ? <Text className="text-xs text-slate-500">{i.hint}</Text> : null}
                  </View>
                  <ChevronRight size={18} color={c.faint} />
                </Pressable>
              ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
