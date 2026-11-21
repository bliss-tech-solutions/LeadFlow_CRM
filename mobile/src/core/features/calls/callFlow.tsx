import { useEffect, useState } from "react";
import { AppState, Linking, Pressable, Text, View } from "react-native";
import { create } from "zustand";
import DateTimePicker from "@react-native-community/datetimepicker";
import { PhoneCall, PhoneMissed, PhoneOff, PhoneForwarded, PhoneIncoming, CalendarPlus } from "lucide-react-native";
import { Button, Field, Sheet, cx } from "../../ui";
import { sendOrQueue, queryClient } from "../../query";
import { toast } from "../../ui/toast";
import { CALL_RESULTS, FOLLOWUP_TYPES, telUrl } from "../../lib/leadMeta";

type PendingCall = { leadId: string; name: string; startedAt: number };

const useCallStore = create<{ pending: PendingCall | null; showSheet: boolean; durationSec?: number; set: (p: Partial<{ pending: PendingCall | null; showSheet: boolean; durationSec?: number }>) => void }>(
  (set) => ({ pending: null, showSheet: false, set: (p) => set(p) }),
);

/** Open the native dialer and remember the call so we can ask for the outcome on return. */
export async function startCall(lead: { _id: string; name: string; phone?: string }) {
  const url = telUrl(lead.phone);
  if (!url) {
    toast.warn("No phone number", "This lead has no phone number to call.");
    return;
  }
  useCallStore.getState().set({ pending: { leadId: lead._id, name: lead.name, startedAt: Date.now() }, showSheet: false });
  try {
    await Linking.openURL(url);
  } catch {
    useCallStore.getState().set({ pending: null });
    toast.error("Couldn't open the dialer");
  }
}

/** Manually log a call without dialing (e.g. called from another phone). */
export function openCallLog(lead: { _id: string; name: string }) {
  useCallStore.getState().set({ pending: { leadId: lead._id, name: lead.name, startedAt: Date.now() }, showSheet: true, durationSec: undefined });
}

const ICONS: Record<string, any> = {
  CONNECTED: PhoneCall,
  NOT_PICKED: PhoneMissed,
  BUSY: PhoneOff,
  CALLBACK_REQUESTED: PhoneForwarded,
  WRONG_NUMBER: PhoneIncoming,
};

/**
 * Mounted once per app. When the user returns from the dialer, asks
 * "How did the call go?" — outcome, notes and an optional follow-up —
 * so calls are never forgotten. Works offline (queued).
 */
export function AfterCallSheet() {
  const { pending, showSheet, durationSec, set } = useCallStore();
  const [result, setResult] = useState<string>("CONNECTED");
  const [notes, setNotes] = useState("");
  const [followup, setFollowup] = useState(false);
  const [when, setWhen] = useState(() => new Date(Date.now() + 24 * 3600_000));
  const [type, setType] = useState("CALL");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      const p = useCallStore.getState().pending;
      if (s === "active" && p && !useCallStore.getState().showSheet) {
        const elapsed = Math.round((Date.now() - p.startedAt) / 1000);
        // Ignore very quick bounces (dialer opened and cancelled).
        if (elapsed >= 3) useCallStore.getState().set({ showSheet: true, durationSec: elapsed });
        else useCallStore.getState().set({ pending: null });
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (showSheet) {
      setResult(durationSec && durationSec > 25 ? "CONNECTED" : "NOT_PICKED");
      setNotes("");
      setFollowup(false);
      setWhen(new Date(Date.now() + 24 * 3600_000));
      setType("CALL");
    }
  }, [showSheet, durationSec]);

  const close = () => set({ pending: null, showSheet: false, durationSec: undefined });

  async function save() {
    if (!pending) return;
    setSaving(true);
    try {
      const r1 = await sendOrQueue(`Call · ${pending.name}`, `/leads/${pending.leadId}/calls`, "POST", {
        result,
        notes: notes.trim() || undefined,
        durationSec: result === "CONNECTED" ? durationSec : 0,
      });
      if (followup) {
        if (when.getTime() <= Date.now()) throw new Error("Pick a future time for the follow-up");
        await sendOrQueue(`Follow-up · ${pending.name}`, `/leads/${pending.leadId}/followups`, "POST", {
          type,
          notes: notes.trim() || undefined,
          scheduledAt: when.toISOString(),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["lead", pending.leadId] });
      queryClient.invalidateQueries({ queryKey: ["my-day"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success(r1 === "queued" ? "Saved offline" : "Call logged", r1 === "queued" ? "It will sync when you're back online." : undefined);
      close();
    } catch (e: any) {
      toast.error("Couldn't save", e?.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={showSheet && Boolean(pending)}
      onClose={close}
      title="How did the call go?"
      subtitle={pending ? `${pending.name}${durationSec ? ` · ${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : ""}` : undefined}
      footer={
        <>
          <Button title="Skip" variant="secondary" onPress={close} className="flex-1" />
          <Button title="Save" onPress={save} loading={saving} className="flex-[2]" />
        </>
      }
    >
      <View className="flex-row flex-wrap gap-2">
        {CALL_RESULTS.map((r) => {
          const Icon = ICONS[r.value];
          const active = result === r.value;
          return (
            <Pressable
              key={r.value}
              onPress={() => setResult(r.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              className={cx(
                "min-h-[48px] flex-row items-center gap-2 rounded-xl border px-3.5",
                active ? "border-brand-600 bg-brand-50 dark:bg-brand-900" : "border-slate-200 dark:border-slate-700",
              )}
              style={{ width: "48%" }}
            >
              <Icon size={18} color={active ? "#4F46E5" : "#64748B"} />
              <Text className={cx("flex-1 text-[14px]", active ? "font-semibold text-brand-700 dark:text-brand-200" : "text-slate-700 dark:text-slate-300")}>{r.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4">
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Budget, preferred unit, objections…" multiline maxLength={2000} />
      </View>

      <Pressable
        onPress={() => setFollowup((f) => !f)}
        accessibilityRole="switch"
        accessibilityState={{ checked: followup }}
        className={cx("flex-row items-center gap-3 rounded-xl border p-3.5", followup ? "border-brand-600 bg-brand-50 dark:bg-brand-900" : "border-slate-200 dark:border-slate-700")}
      >
        <CalendarPlus size={20} color={followup ? "#4F46E5" : "#64748B"} />
        <Text className="flex-1 text-[15px] font-medium text-slate-800 dark:text-slate-200">Schedule a follow-up</Text>
        <View className={cx("h-6 w-11 justify-center rounded-full px-0.5", followup ? "items-end bg-brand-600" : "items-start bg-slate-300 dark:bg-slate-700")}>
          <View className="h-5 w-5 rounded-full bg-white" />
        </View>
      </Pressable>

      {followup && (
        <View className="mt-3">
          <View className="mb-3 flex-row flex-wrap gap-2">
            {FOLLOWUP_TYPES.map((t) => (
              <Pressable key={t} onPress={() => setType(t)} className={cx("rounded-full border px-3 py-1.5", type === t ? "border-brand-600 bg-brand-600" : "border-slate-200 dark:border-slate-700")}>
                <Text className={cx("text-xs font-medium", type === t ? "text-white" : "text-slate-700 dark:text-slate-300")}>{t.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-2">
            <Button title={when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} variant="secondary" className="flex-1" onPress={() => setPicker("date")} />
            <Button title={when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} variant="secondary" className="flex-1" onPress={() => setPicker("time")} />
          </View>
          <View className="mt-2 flex-row gap-2">
            {[
              { l: "In 2h", ms: 2 * 3600_000 },
              { l: "Tomorrow 10am", at: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; } },
              { l: "In 3 days", ms: 3 * 24 * 3600_000 },
            ].map((q) => (
              <Pressable key={q.l} onPress={() => setWhen(q.at ? q.at() : new Date(Date.now() + (q.ms || 0)))} className="rounded-full bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                <Text className="text-xs text-slate-700 dark:text-slate-300">{q.l}</Text>
              </Pressable>
            ))}
          </View>
          {picker && (
            <DateTimePicker
              value={when}
              mode={picker}
              minimumDate={new Date()}
              minuteInterval={15}
              onValueChange={(_, d) => {
                setPicker(null);
                if (d) setWhen(d);
              }}
              onDismiss={() => setPicker(null)}
            />
          )}
        </View>
      )}
    </Sheet>
  );
}
