"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({
  page,
  pages,
  total,
  label = "items",
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  label?: string;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) {
    return (
      <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        {total} {label}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-slate-500">
        Page <b className="text-slate-800">{page}</b> of{" "}
        <b className="text-slate-800">{pages}</b> · {total} {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
