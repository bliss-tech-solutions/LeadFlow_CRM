import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Button, Field, Sheet, cx } from "../../ui";
import { sendOrQueue } from "../../query";
import { toast } from "../../ui/toast";
import { FOLLOWUP_TYPES } from "../../lib/leadMeta";

/** Schedule a follow-up (call, site visit, meeting) for a lead. Works offline. */
export function FollowupSheet({ visible, lead, onClose, onSaved }: { visible: boolean; lead: { _id: string; name: string }; onClose: () => void; onSaved?: () => void }) {
  const [type, setType] = useState("CALL");
  const [when, setWhen] = useState(() => new Date(Date.now() + 24 * 3600_000));
  const [notes, setNotes] = useState("");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      setWhen(d);
      setType("CALL");
      setNotes("");
    }
  }, [visible]);

  async function save() {
    if (when.getTime() <= Date.now()) return toast.warn("Pick a future time");
    setBusy(true);
    try {
      const r = await sendOrQueue(`Follow-up · ${lead.name}`, `/leads/${lead._id}/followups`, "POST", { type, notes: notes.trim() || undefined, scheduledAt: when.toISOString() });
      toast.success(r === "queued" ? "Saved offline" : "Follow-up scheduled", `${when.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast.error("Couldn't schedule", e?.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Schedule follow-up" subtitle={lead.name} footer={<Button title="Schedule" full loading={busy} onPress={save} />}>
      <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Type</Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {FOLLOWUP_TYPES.map((t) => (
          <Pressable key={t} onPress={() => setType(t)} className={cx("min-h-[38px] justify-center rounded-full border px-3.5", type === t ? "border-brand-600 bg-brand-600" : "border-slate-200 dark:border-slate-700")}>
            <Text className={cx("text-[13px] font-medium", type === t ? "text-white" : "text-slate-700 dark:text-slate-300")}>{t.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Text>
          </Pressable>
        ))}
      </View>
      <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">When</Text>
      <View className="flex-row gap-2">
        <Button title={when.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} variant="secondary" className="flex-1" onPress={() => setPicker("date")} />
        <Button title={when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })} variant="secondary" className="flex-1" onPress={() => setPicker("time")} />
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
      <View className="mt-4">
        <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Agenda, address for site visit…" multiline maxLength={1000} />
      </View>
    </Sheet>
  );
}
