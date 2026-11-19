"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal, { btn, field } from "./Modal";
import { LOST_REASONS, statusLabel } from "../lib/leadMeta";

type Props = {
  open: boolean;
  status: string | null;
  leadName?: string;
  count?: number;
  onClose: () => void;
  onConfirm: (payload: { status: string; lostReason?: string; dealValue?: number }) => Promise<void>;
};

/**
 * Collects the extra context some status changes need:
 * a reason for LOST / NOT_INTERESTED and an optional deal value for WON.
 */
export default function StatusChangeModal({ open, status, leadName, count, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const [deal, setDeal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setOther("");
      setDeal("");
      setError("");
    }
  }, [open]);

  if (!status) return null;
  const needsReason = status === "LOST" || status === "NOT_INTERESTED";
  const isWon = status === "WON";

  async function submit() {
    setError("");
    const finalReason = reason === "Other" ? other.trim() : reason;
    if (needsReason && !finalReason) {
      setError("Please choose a reason — it helps the team improve targeting.");
      return;
    }
    const dealValue = deal.trim() ? Number(deal) : undefined;
    if (dealValue !== undefined && (!Number.isFinite(dealValue) || dealValue < 0)) {
      setError("Deal value must be a positive number.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm({ status: status!, lostReason: finalReason || undefined, dealValue });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Could not update status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Mark as ${statusLabel(status)}`}
      subtitle={count && count > 1 ? `${count} selected leads` : leadName}
      footer={
        <>
          <button className={btn.secondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={isWon ? btn.whatsapp : needsReason ? btn.danger : btn.primary} onClick={submit} disabled={saving}>
            {saving && <Loader2 size={13} className="animate-spin" />} Confirm
          </button>
        </>
      }
    >
      {needsReason && (
        <div>
          <span className="text-xs font-semibold text-slate-700">Reason</span>
          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {LOST_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  reason === r ? "border-rose-400 bg-rose-50 font-semibold text-rose-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === "Other" && (
            <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Describe the reason" className={field} maxLength={300} />
          )}
        </div>
      )}
      {isWon && (
        <label className="block text-xs font-semibold text-slate-700">
          Deal value (₹, optional)
          <input value={deal} onChange={(e) => setDeal(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="e.g. 8500000" className={field} />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">Used for revenue analytics. Visible to your team and admins.</span>
        </label>
      )}
      {!needsReason && !isWon && <p className="text-sm text-slate-600">Change status to {statusLabel(status)}?</p>}
      {error && <div className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}
    </Modal>
  );
}
