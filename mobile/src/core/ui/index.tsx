import { forwardRef, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { AlertCircle, ChevronLeft, Inbox, Search, WifiOff, X } from "lucide-react-native";
import { useTheme } from "./theme";
import { STATUS_STYLE, initials, scoreTone, statusLabel } from "../lib/leadMeta";
import { useOutbox } from "../query";
import { APP_NAME, APP_VARIANT } from "../config";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Tracks keyboard appearance and height across iOS and Android */
export function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}

/* ------------------------------------------------------------------ */
/* Screen scaffold                                                     */
/* ------------------------------------------------------------------ */

type ScreenProps = {
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  headerNode?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  padded?: boolean;
  footer?: ReactNode;
};

/** Safe-area aware page with a large title, optional back button and pull-to-refresh. */
export function Screen({ title, subtitle, back, right, headerNode, children, scroll = true, refreshing, onRefresh, padded = true, footer }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const pending = useOutbox((s) => s.items.length);
  const keyboardHeight = useKeyboardHeight();

  const header = (title || back || right || headerNode) && (
    <View
      className="flex-row items-start justify-between gap-3 bg-slate-50 px-4 pb-3.5 dark:bg-[#0B1120]"
      style={{ paddingTop: insets.top + 8 }}
    >
      <View className="flex-1 flex-row items-start gap-1">
        {back && (
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={12}
            className="-ml-2 h-10 w-10 items-center justify-center rounded-full active:bg-slate-200 dark:active:bg-slate-800"
          >
            <ChevronLeft size={26} color={c.text} />
          </Pressable>
        )}
        <View className="flex-1">
          {headerNode ? (
            headerNode
          ) : (
            <>
              {!back && (
                <View className="mb-0.5 flex-row items-center gap-1.5">
                  <View className={cx("h-2 w-2 rounded-full", APP_VARIANT === "admin" ? "bg-slate-700 dark:bg-slate-300" : "bg-brand-600 dark:bg-brand-400")} />
                  <Text className={cx("text-[11px] font-bold tracking-wider uppercase", APP_VARIANT === "admin" ? "text-slate-600 dark:text-slate-300" : "text-brand-600 dark:text-brand-400")}>
                    {APP_NAME}
                  </Text>
                </View>
              )}
              {title ? (
                <Text accessibilityRole="header" className={cx("font-bold text-slate-900 dark:text-slate-50", back ? "text-xl" : "text-[28px] leading-9")} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? <Text className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400" numberOfLines={2}>{subtitle}</Text> : null}
            </>
          )}
        </View>
      </View>
      {right ? <View className="pt-0.5">{right}</View> : null}
    </View>
  );

  const banner = pending > 0 && (
    <View className="mx-4 mb-2 flex-row items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-950">
      <WifiOff size={14} color="#D97706" />
      <Text className="flex-1 text-xs text-amber-800 dark:text-amber-200">{pending} change{pending > 1 ? "s" : ""} waiting to sync — they'll send when you're back online.</Text>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-[#0B1120]">
      {header || <View style={{ height: insets.top }} />}
      {banner}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" && footer ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
      >
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              paddingHorizontal: padded ? 16 : 0,
              paddingTop: 4,
              paddingBottom: insets.bottom + 124,
            }}
            refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.brand} colors={[c.brand]} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View className={cx("flex-1", padded && "px-4")}>{children}</View>
        )}
        {footer ? <View style={{ paddingBottom: insets.bottom + 8 }} className="border-t border-slate-200 bg-white px-4 pt-3 dark:border-slate-800 dark:bg-slate-900">{footer}</View> : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "whatsapp";
const BTN: Record<BtnVariant, { box: string; text: string; spinner: string }> = {
  primary: { box: "bg-brand-600 active:bg-brand-700", text: "text-white", spinner: "#fff" },
  secondary: { box: "border border-slate-200 bg-white active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800", text: "text-slate-800 dark:text-slate-100", spinner: "#475569" },
  ghost: { box: "active:bg-slate-100 dark:active:bg-slate-800", text: "text-brand-600 dark:text-brand-200", spinner: "#4F46E5" },
  danger: { box: "bg-rose-600 active:bg-rose-700", text: "text-white", spinner: "#fff" },
  whatsapp: { box: "bg-wa-600 active:bg-wa-700", text: "text-white", spinner: "#fff" },
};

type ButtonProps = Omit<PressableProps, "children"> & {
  title: string;
  variant?: BtnVariant;
  icon?: ReactNode;
  loading?: boolean;
  size?: "md" | "lg" | "sm";
  className?: string;
  full?: boolean;
};

export function Button({ title, variant = "primary", icon, loading, size = "md", disabled, className, full, onPress, ...rest }: ButtonProps) {
  const s = BTN[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress?.(e);
      }}
      className={cx(
        "flex-row items-center justify-center gap-2 rounded-xl",
        size === "lg" ? "min-h-[52px] px-5" : size === "sm" ? "min-h-[36px] px-3" : "min-h-[46px] px-4",
        s.box,
        (disabled || loading) && "opacity-50",
        full && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <ActivityIndicator size="small" color={s.spinner} /> : icon}
      <Text className={cx("font-semibold", size === "sm" ? "text-xs" : "text-[15px]", s.text)}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, tone = "default", className }: { icon: ReactNode; label: string; onPress?: () => void; tone?: "default" | "brand" | "whatsapp"; className?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      className={cx(
        "h-11 w-11 items-center justify-center rounded-full",
        tone === "brand" ? "bg-brand-50 active:bg-brand-100 dark:bg-brand-900" : tone === "whatsapp" ? "bg-wa-50 active:bg-wa-100 dark:bg-emerald-950" : "active:bg-slate-200 dark:active:bg-slate-800",
        className,
      )}
    >
      {icon}
    </Pressable>
  );
}

/** Floating action button (bottom-right, above the tab bar). */
export function Fab({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
        onPress();
      }}
      className="absolute bottom-6 right-5 h-14 flex-row items-center gap-2 rounded-full bg-brand-600 px-5 shadow-lg active:bg-brand-700"
      style={{ elevation: 6 }}
    >
      {icon}
      <Text className="text-[15px] font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces & text                                                     */
/* ------------------------------------------------------------------ */

export function Card({ children, className, onPress }: { children: ReactNode; className?: string; onPress?: () => void }) {
  const base = cx("rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900", className);
  if (onPress)
    return (
      <Pressable onPress={onPress} accessibilityRole="button" className={cx(base, "active:opacity-80")}>
        {children}
      </Pressable>
    );
  return <View className={base}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View className="mb-2 mt-6 flex-row items-center justify-between">
      <Text accessibilityRole="header" className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <Text className={cx("text-[13px] text-slate-500 dark:text-slate-400", className)}>{children}</Text>;
}

export function Stat({ label, value, icon, tone = "#4F46E5", onPress }: { label: string; value: ReactNode; icon?: ReactNode; tone?: string; onPress?: () => void }) {
  return (
    <Card className="flex-1 p-3.5" onPress={onPress}>
      {icon ? (
        <View className="mb-2 h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${tone}1A` }}>
          {icon}
        </View>
      ) : null}
      <Text className="text-2xl font-bold text-slate-900 dark:text-slate-50" style={{ fontVariant: ["tabular-nums"] }}>
        {value ?? "–"}
      </Text>
      <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pills                                                               */
/* ------------------------------------------------------------------ */

export function StatusPill({ status }: { status?: string }) {
  const s = STATUS_STYLE[String(status)] || STATUS_STYLE.CONTACTED;
  return (
    <View className={cx("flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1", s.bg)}>
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      <Text className={cx("text-[11px] font-semibold", s.text)}>{statusLabel(status)}</Text>
    </View>
  );
}

export function ScoreChip({ score }: { score?: number }) {
  const t = scoreTone(score);
  return (
    <View className={cx("self-start rounded-full px-2 py-0.5", t.bg)} accessibilityLabel={`Lead score ${score ?? 0}, ${t.label}`}>
      <Text className={cx("text-[11px] font-bold", t.text)}>
        {Number(score) >= 70 ? "🔥 " : ""}
        {score ?? 0}
      </Text>
    </View>
  );
}

const BADGE: Record<string, { box: string; text: string }> = {
  slate: { box: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300" },
  brand: { box: "bg-brand-50 dark:bg-brand-900", text: "text-brand-700 dark:text-brand-200" },
  amber: { box: "bg-amber-50 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300" },
  rose: { box: "bg-rose-50 dark:bg-rose-950", text: "text-rose-700 dark:text-rose-300" },
  emerald: { box: "bg-emerald-50 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300" },
};

/** Small label. Icons go in `icon` (never inside <Text> — that crashes on native). */
export function Badge({ children, tone = "slate", icon }: { children: ReactNode; tone?: "slate" | "brand" | "amber" | "rose" | "emerald"; icon?: ReactNode }) {
  const t = BADGE[tone];
  return (
    <View className={cx("flex-row items-center gap-1 self-start rounded-md px-1.5 py-0.5", t.box)}>
      {icon}
      <Text className={cx("text-[10px] font-semibold", t.text)}>{children}</Text>
    </View>
  );
}

/**
 * Route error boundary (expo-router). Shows the real error message with a retry
 * instead of a blank red screen, so problems can be reported precisely.
 */
export function RouteErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 px-8 dark:bg-[#0B1120]">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-rose-50 dark:bg-rose-950">
        <AlertCircle size={30} color="#E11D48" />
      </View>
      <Text className="text-center text-lg font-bold text-slate-900 dark:text-white">Something went wrong on this screen</Text>
      <Text selectable className="mt-2 text-center text-[13px] leading-5 text-slate-500">{error?.message || "Unknown error"}</Text>
      <Button title="Try again" className="mt-6" onPress={() => void retry()} />
      <Button title="Go home" variant="ghost" className="mt-1" onPress={() => router.replace("/")} />
    </View>
  );
}

export function Avatar({ name, uri, size = 40 }: { name?: string; uri?: string | null; size?: number }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />;
  return (
    <View className="items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900" style={{ width: size, height: size }}>
      <Text className="font-bold text-brand-700 dark:text-brand-200" style={{ fontSize: size * 0.38 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

type FieldProps = TextInputProps & { label?: string; error?: string; hint?: string; left?: ReactNode; right?: ReactNode };

export const Field = forwardRef<ComponentRef<typeof TextInput>, FieldProps>(function Field({ label, error, hint, left, right, multiline, className, ...rest }, ref) {
  const { c } = useTheme();
  return (
    <View className="mb-3.5">
      {label ? <Text className="mb-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-300">{label}</Text> : null}
      <View
        className={cx(
          "flex-row items-center gap-2 rounded-xl border bg-white px-3 dark:bg-slate-900",
          error ? "border-rose-400" : "border-slate-200 dark:border-slate-700",
          multiline ? "py-2.5" : "min-h-[48px]",
        )}
      >
        {left}
        <TextInput
          ref={ref}
          placeholderTextColor={c.faint}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          className={cx("flex-1 text-[15px] text-slate-900 dark:text-slate-100", multiline && "min-h-[96px]", className)}
          accessibilityLabel={label}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text className="mt-1 text-xs text-rose-600">{error}</Text> : hint ? <Text className="mt-1 text-xs text-slate-500">{hint}</Text> : null}
    </View>
  );
});

/* ------------------------------------------------------------------ */
/* Chips & segmented control                                           */
/* ------------------------------------------------------------------ */

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(active) }}
      className={cx(
        "mr-2 min-h-[34px] flex-row items-center gap-1.5 rounded-full border px-3.5",
        active ? "border-brand-600 bg-brand-600" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
      )}
    >
      {icon}
      <Text className={cx("text-[13px] font-medium", active ? "text-white" : "text-slate-700 dark:text-slate-300")}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800" accessibilityRole="tablist">
      {options.map((o) => {
        const isSelected = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onChange(o.value);
            }}
            className={cx("min-h-[36px] flex-1 items-center justify-center rounded-lg", isSelected ? "bg-white dark:bg-slate-700" : "")}
            style={isSelected ? { elevation: 1 } : undefined}
          >
            <Text className={cx("text-[13px] font-semibold", isSelected ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400")}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Sheets                                                              */
/* ------------------------------------------------------------------ */

type SheetProps = { visible: boolean; onClose: () => void; title?: string; subtitle?: string; children: ReactNode; footer?: ReactNode; full?: boolean };

/** Bottom sheet built on the native Modal (keyboard aware, safe-area aware, swipe-to-dismiss on iOS). */
export function Sheet({ visible, onClose, title, subtitle, children, footer, full }: SheetProps) {
  const insets = useSafeAreaInsets();
  const { c } = useTheme();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const sub = Keyboard.addListener(showEvent, () => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 60);
    });
    return () => sub.remove();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, justifyContent: "flex-end" }}
      >
        <Pressable
          className="absolute inset-0 bg-black/50"
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
          accessibilityLabel="Close"
        />
        <View
          className="rounded-t-3xl bg-white shadow-2xl dark:bg-slate-900"
          style={{
            maxHeight: full ? "94%" : "88%",
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View className="items-center pt-2.5">
            <View className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
          </View>
          {(title || subtitle) && (
            <View className="flex-row items-start justify-between gap-3 px-5 pb-2 pt-3">
              <View className="flex-1">
                {title ? <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">{title}</Text> : null}
                {subtitle ? <Text className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</Text> : null}
              </View>
              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  onClose();
                }}
                accessibilityLabel="Close"
                hitSlop={10}
                className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <X size={18} color={c.muted} />
              </Pressable>
            </View>
          )}
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
          >
            {children}
          </ScrollView>
          {footer ? <View className="flex-row gap-2 border-t border-slate-100 px-5 pt-3 dark:border-slate-800">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Pick one option from a list in a bottom sheet (replacement for <select>). */
export function SelectSheet<T extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { value: T; label: string; description?: string }[];
  value?: T;
  onSelect: (v: T) => void;
}) {
  const { c } = useTheme();
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!visible) setSearch("");
  }, [visible]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q)),
    );
  }, [options, search]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.length > 5 && (
        <View className="mb-2.5 flex-row items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800">
          <Search size={16} color={c.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search..."
            placeholderTextColor={c.faint}
            className="flex-1 py-0.5 text-[14px] text-slate-900 dark:text-white"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <X size={15} color={c.muted} />
            </Pressable>
          ) : null}
        </View>
      )}

      {filteredOptions.length === 0 ? (
        <View className="items-center py-6">
          <Text className="text-sm text-slate-400">No matching options</Text>
        </View>
      ) : (
        filteredOptions.map((o) => (
          <Pressable
            key={o.value || "__none"}
            accessibilityRole="button"
            accessibilityState={{ selected: value === o.value }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => undefined);
              onSelect(o.value);
              onClose();
            }}
            className={cx(
              "mb-1.5 min-h-[50px] justify-center rounded-xl px-4 py-2.5",
              value === o.value
                ? "bg-brand-50 dark:bg-brand-900/40"
                : "active:bg-slate-100 dark:active:bg-slate-800",
            )}
          >
            <Text
              className={cx(
                "text-[15px]",
                value === o.value
                  ? "font-semibold text-brand-700 dark:text-brand-300"
                  : "text-slate-800 dark:text-slate-200",
              )}
            >
              {o.label}
            </Text>
            {o.description ? (
              <Text className="mt-0.5 text-xs text-slate-500">{o.description}</Text>
            ) : null}
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({ title, message, icon, action }: { title: string; message?: string; icon?: ReactNode; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View className="items-center px-8 py-14">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800">{icon || <Inbox size={28} color={c.faint} />}</View>
      <Text className="text-center text-base font-semibold text-slate-800 dark:text-slate-200">{title}</Text>
      {message ? <Text className="mt-1.5 text-center text-[13px] leading-5 text-slate-500 dark:text-slate-400">{message}</Text> : null}
      {action ? <View className="mt-5">{action}</View> : null}
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : "Something went wrong.";
  const status = (error as any)?.status;
  return (
    <EmptyState
      icon={status === 0 ? <WifiOff size={28} color="#D97706" /> : <AlertCircle size={28} color="#E11D48" />}
      title={status === 403 ? "No access" : status === 0 ? "You're offline" : "Couldn't load this"}
      message={msg}
      action={onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : undefined}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <View className={cx("rounded-xl bg-slate-200/80 dark:bg-slate-800", className)} />;
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <View className="gap-2.5 pt-1">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row items-center gap-3 rounded-2xl bg-white p-4 dark:bg-slate-900">
          <Skeleton className="h-10 w-10 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Row({ label, value, onPress, icon, right, danger }: { label: string; value?: ReactNode; onPress?: () => void; icon?: ReactNode; right?: ReactNode; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      className="min-h-[52px] flex-row items-center gap-3 border-b border-slate-100 py-3 active:opacity-70 dark:border-slate-800"
    >
      {icon}
      <Text className={cx("flex-1 text-[15px]", danger ? "text-rose-600" : "text-slate-800 dark:text-slate-200")}>{label}</Text>
      {typeof value === "string" || typeof value === "number" ? <Text className="max-w-[55%] text-right text-[14px] text-slate-500 dark:text-slate-400" numberOfLines={1}>{value}</Text> : value}
      {right}
    </Pressable>
  );
}

export function Loading() {
  const { c } = useTheme();
  return (
    <View className="flex-1 items-center justify-center py-20">
      <ActivityIndicator color={c.brand} />
    </View>
  );
}
