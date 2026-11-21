import type { ComponentType } from "react";
import { Platform, StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../ui/theme";
import { useOutbox } from "../query";

export type TabDef = { name: string; title: string; Icon: ComponentType<{ color: string; size: number }>; show: boolean };

/** Bottom tab bar shared by both apps (role decides which tabs are visible). */
export function AppTabs({ tabs }: { tabs: TabDef[] }) {
  const { c, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const pending = useOutbox((s) => s.items.length);

  // Sit just above the home indicator on iOS instead of floating high up it.
  const bottomOffset = Platform.OS === "ios"
    ? (insets.bottom > 0 ? insets.bottom - 6 : 12)
    : Math.max(insets.bottom + 8, 12);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: isDark ? "#94A3B8" : "#64748B",
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600" },
        tabBarItemStyle: { height: 50, justifyContent: "center" },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: bottomOffset,
          height: 62,
          borderRadius: 24,
          backgroundColor: c.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: isDark ? 0.35 : 0.12,
          shadowRadius: 16,
          elevation: 12,
          paddingHorizontal: 8,
          paddingTop: 6,
          paddingBottom: 6,
          marginHorizontal: 16
        },
      }}
    >
      {tabs.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            href: t.show ? undefined : null,
            tabBarIcon: ({ color }) => <t.Icon color={String(color)} size={22} />,
            tabBarBadge: t.name === "more" && pending ? pending : undefined,
            tabBarAccessibilityLabel: t.title,
          }}
        />
      ))}
    </Tabs>
  );
}
