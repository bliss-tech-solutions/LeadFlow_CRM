"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, Pin, PinOff, Trash2, StickyNote, AtSign } from "lucide-react";
import { api } from "../lib/api";
import { getUser } from "../lib/auth";
import { timeAgo } from "../lib/leadMeta";

type Props = {
  leadId: string;
  notes: any[];
  mentionable: { _id: string; name: string; role?: string }[];
  onChange: () => void;
};

/** Free-text notes with @mentions and pinning. */
export default function NotesPanel({ leadId, notes, mentionable, onChange }: Props) {
  const me = getUser();
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<{ _id: string; name: string }[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return mentionable.filter((u) => u._id !== me?.id && u.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, mentionable, me?.id]);

  function onInput(value: string) {
    setText(value);
    const caret = ref.current?.selectionStart ?? value.length;
    const match = value.slice(0, caret).match(/@([\w.]*)$/);
    setQuery(match ? match[1] : null);
  }

  function pick(u: { _id: string; name: string }) {
    const caret = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.]*)$/, `@${u.name} `);
    setText(before + text.slice(caret));
    setMentions((m) => (m.some((x) => x._id === u._id) ? m : [...m, u]));
    setQuery(null);
    ref.current?.focus();
  }

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    try {
      const used = mentions.filter((m) => text.includes(`@${m.name}`)).map((m) => m._id);
      await api(`/leads/${leadId}/notes`, { method: "POST", body: JSON.stringify({ body: text.trim(), mentions: used }) });
      setText("");
      setMentions([]);
      onChange();
    } catch (e: any) {
      setError(e?.message || "Could not save note");
    } finally {
      setSaving(false);
    }
  }

  async function togglePin(n: any) {
    await api(`/leads/${leadId}/notes/${n._id}`, { method: "PATCH", body: JSON.stringify({ pinned: !n.pinned }) }).catch(() => {});
    onChange();
  }

  async function remove(n: any) {
    if (!window.confirm("Delete this note?")) return;
    await api(`/leads/${leadId}/notes/${n._id}`, { method: "DELETE" }).catch(() => {});
    onChange();
  }

  const isAdmin = me?.role === "ADMIN" || me?.role === "MANAGER";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Notes</h2>
        <StickyNote size={16} className="text-slate-400" />
      </div>

      <div className="relative mt-3">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void save();
          }}
          rows={3}
          maxLength={4000}
          placeholder="Add a note… type @ to mention a teammate"
          className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
        {suggestions.length > 0 && (
          <div className="absolute left-2 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {suggestions.map((u) => (
              <button
                key={u._id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(u);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-indigo-50"
              >
                <AtSign size={12} className="text-indigo-500" /> {u.name}
                {u.role && <span className="ml-auto text-[10px] text-slate-400">{u.role}</span>}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">Ctrl + Enter to save</span>
          <button
            type="button"
            onClick={save}
            disabled={saving || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving && <Loader2 size={12} className="animate-spin" />} Save note
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>

      <div className="mt-4 space-y-2.5">
        {notes.length === 0 && <p className="text-xs text-slate-500">No notes yet. Capture requirements, budget and objections here.</p>}
        {notes.map((n) => (
          <div key={n._id} className={`group rounded-xl border p-3 ${n.pinned ? "border-amber-200 bg-amber-50/60" : "border-slate-100 bg-slate-50"}`}>
            <p className="whitespace-pre-line break-words text-sm text-slate-800">
              {String(n.body)
                .split(/(@[A-Za-z][\w.]*(?: [A-Z][\w.]*)?)/g)
                .map((part: string, i: number) =>
                  part.startsWith("@") ? (
                    <span key={i} className="font-semibold text-indigo-700">
                      {part}
                    </span>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )}
            </p>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
              <span>
                {n.author?.name || "—"} · {timeAgo(n.createdAt)}
              </span>
              <span className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
                <button type="button" onClick={() => togglePin(n)} title={n.pinned ? "Unpin" : "Pin"} className="rounded p-1 hover:bg-white">
                  {n.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                </button>
                {(isAdmin || String(n.author?._id) === me?.id) && (
                  <button type="button" onClick={() => remove(n)} title="Delete" className="rounded p-1 hover:bg-white hover:text-rose-600">
                    <Trash2 size={12} />
                  </button>
                )}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
