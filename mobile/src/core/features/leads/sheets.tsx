import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import { get } from "../../api/client";
import { Avatar, Button, Field, Sheet, cx } from "../../ui";
import { LEAD_STATUSES, LOST_REASONS, STATUS_STYLE, statusLabel } from "../../lib/leadMeta";

/** Choose a new status; LOST / NOT INTERESTED require a reason, WON takes an optional deal value. */
export function StatusSheet({
  visible,
  current,
  count,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  current?: string;
  count?: number;
  onClose: () => void;
  onConfirm: (p: { status: string; lostReason?: string; dealValue?: number }) => Promise<void>;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [deal, setDeal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) {
      setStatus(null);
      setReason("");
      setOther("");
      setDeal("");
      setError("");
    }
  }, [visible]);

  const needsReason = status === "LOST" || status === "NOT_INTERESTED";
  const isWon = status === "WON";

  async function confirm(s = status) {
    if (!s) return;
    setError("");
    const finalReason = reason === "Other" ? other.trim() : reason;
    if ((s === "LOST" || s === "NOT_INTERESTED") && !finalReason) return setError("Please choose a reason.");
    const dealValue = deal.trim() ? Number(deal) : undefined;
    if (dealValue !== undefined && (!Number.isFinite(dealValue) || dealValue < 0)) return setError("Deal value must be a positive number.");
    setBusy(true);
    try {
      await onConfirm({ status: s, lostReason: finalReason || undefined, dealValue });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Could not update status");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={status ? `Mark as ${statusLabel(status)}` : "Change status"}
      subtitle={count && count > 1 ? `${count} leads selected` : undefined}
      footer={
        status && (needsReason || isWon) ? (
          <>
            <Button title="Back" variant="secondary" onPress={() => setStatus(null)} className="flex-1" />
            <Button title="Confirm" variant={isWon ? "whatsapp" : "danger"} loading={busy} onPress={() => confirm()} className="flex-[2]" />
          </>
        ) : undefined
      }
    >
      {!status || !(needsReason || isWon) ? (
        LEAD_STATUSES.map((s) => {
          const st = STATUS_STYLE[s];
          return (
            <Pressable
              key={s}
              disabled={s === current || busy}
              onPress={() => {
                if (s === "LOST" || s === "NOT_INTERESTED" || s === "WON") setStatus(s);
                else void confirm(s);
              }}
              accessibilityRole="button"
              className={cx("mb-1.5 min-h-[50px] flex-row items-center gap-3 rounded-xl px-4", s === current ? "bg-slate-100 dark:bg-slate-800" : "active:bg-slate-100 dark:active:bg-slate-800")}
            >
              <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.dot }} />
              <Text className="flex-1 text-[15px] text-slate-800 dark:text-slate-200">{statusLabel(s)}</Text>
              {s === current ? <Check size={18} color="#4F46E5" /> : null}
            </Pressable>
          );
        })
      ) : needsReason ? (
        <View>
          <Text className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">Why is this lead lost?</Text>
          <View className="flex-row flex-wrap gap-2">
            {LOST_REASONS.map((r) => (
              <Pressable
                key={r}
                onPress={() => setReason(r)}
                className={cx("rounded-xl border px-3 py-2.5", reason === r ? "border-rose-400 bg-rose-50 dark:bg-rose-950" : "border-slate-200 dark:border-slate-700")}
              >
                <Text className={cx("text-[13px]", reason === r ? "font-semibold text-rose-700 dark:text-rose-300" : "text-slate-700 dark:text-slate-300")}>{r}</Text>
              </Pressable>
            ))}
          </View>
          {reason === "Other" && (
            <View className="mt-3">
              <Field value={other} onChangeText={setOther} placeholder="Describe the reason" maxLength={300} />
            </View>
          )}
        </View>
      ) : (
        <Field label="Deal value (₹, optional)" value={deal} onChangeText={(t) => setDeal(t.replace(/[^\d.]/g, ""))} keyboardType="decimal-pad" placeholder="e.g. 8500000" hint="Used for revenue analytics." />
      )}
      {error ? <Text className="mt-2 text-[13px] text-rose-600">{error}</Text> : null}
    </Sheet>
  );
}

/** Pick a salesperson (scoped by the server to the caller's business). */
export function AssignSheet({ visible, onClose, onPick, projectId }: { visible: boolean; onClose: () => void; onPick: (userId: string) => Promise<void>; projectId?: string }) {
  const q = useQuery({ queryKey: ["sales-users"], queryFn: () => get<{ users: any[] }>("/users", { role: "SALES", limit: 100 }), enabled: visible });
  const [busy, setBusy] = useState<string | null>(null);
  const users = (q.data?.users || []).filter(
    (u) => u.isActive !== false && (!projectId || !u.assignedProjects?.length || u.assignedProjects.some((p: any) => String(p?._id || p) === projectId)),
  );
  return (
    <Sheet visible={visible} onClose={onClose} title="Assign to salesperson" subtitle="Only people who work on this project are shown.">
      {q.isLoading ? <Text className="py-6 text-center text-slate-500">Loading team…</Text> : null}
      {!q.isLoading && users.length === 0 ? <Text className="py-6 text-center text-slate-500">No eligible salespeople. Assign the project to someone first.</Text> : null}
      {users.map((u) => (
        <Pressable
          key={u._id}
          disabled={Boolean(busy)}
          onPress={async () => {
            setBusy(u._id);
            try {
              await onPick(u._id);
              onClose();
            } finally {
              setBusy(null);
            }
          }}
          className="mb-1.5 min-h-[56px] flex-row items-center gap-3 rounded-xl px-3 active:bg-slate-100 dark:active:bg-slate-800"
        >
          <Avatar name={u.name} uri={u.profilePhotoUrl} size={38} />
          <View className="flex-1">
            <Text className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{u.name}</Text>
            <Text className="text-xs text-slate-500">{u.assignedToday ?? 0} today · {u.assignedLeadCount ?? 0} total</Text>
          </View>
          {busy === u._id ? <Text className="text-xs text-brand-600">Assigning…</Text> : null}
        </Pressable>
      ))}
    </Sheet>
  );
}
