import { useColorScheme } from "nativewind";

/** Raw colors for places classNames can't reach (icons, charts, status bar, navigation). */
export const palette = {
  light: {
    bg: "#F8FAFC",
    card: "#FFFFFF",
    border: "#E2E8F0",
    text: "#0F172A",
    muted: "#64748B",
    faint: "#94A3B8",
    brand: "#4F46E5",
    brandSoft: "#EEF2FF",
    wa: "#059669",
    danger: "#E11D48",
    warn: "#D97706",
    success: "#16A34A",
    tabBar: "#FFFFFF",
  },
  dark: {
    bg: "#0B1120",
    card: "#111827",
    border: "#1F2937",
    text: "#F1F5F9",
    muted: "#94A3B8",
    faint: "#64748B",
    brand: "#818CF8",
    brandSoft: "#1E1B4B",
    wa: "#34D399",
    danger: "#FB7185",
    warn: "#FBBF24",
    success: "#4ADE80",
    tabBar: "#0F172A",
  },
};

export type Palette = typeof palette.light;

export function useTheme() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  return { isDark, c: isDark ? palette.dark : palette.light, colorScheme, setColorScheme };
}
