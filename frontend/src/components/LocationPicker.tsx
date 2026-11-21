"use client";

import { useMemo } from "react";
import { MapPin } from "lucide-react";
import {
  STATES,
  GUJARAT_CITIES,
  getCitiesForState,
  getAreasForCity,
} from "../lib/locations";

export interface LocationPickerProps {
  state?: string;
  city?: string;
  area?: string;
  customArea?: string;
  pincode?: string;
  onChange: (patch: {
    state?: string;
    city?: string;
    area?: string;
    customArea?: string;
    pincode?: string;
  }) => void;
}

export default function LocationPicker({
  state = "Gujarat",
  city = "",
  area = "",
  customArea = "",
  pincode = "",
  onChange,
}: LocationPickerProps) {
  const isGujarat = state.trim().toLowerCase() === "gujarat";
  const cities = useMemo(() => getCitiesForState(state), [state]);
  const predefinedAreas = useMemo(() => getAreasForCity(city), [city]);
  const isOtherArea = area === "Other" || (Boolean(area) && !predefinedAreas.includes(area));

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-3.5">
      <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
        <MapPin size={15} className="text-indigo-600" />
        <span>Location & Geographic Classification</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* State */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            State
          </label>
          <select
            value={state || "Gujarat"}
            onChange={(e) => {
              const nextState = e.target.value;
              const nextCities = getCitiesForState(nextState);
              onChange({
                state: nextState,
                city: nextCities[0] || "",
                area: "",
                customArea: "",
              });
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* City */}
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            {isGujarat ? "Gujarat City (Predefined)" : "City"}
          </label>
          <select
            value={city}
            onChange={(e) => {
              onChange({
                city: e.target.value,
                area: "",
                customArea: "",
              });
            }}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">Select city…</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {city && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Predefined Area */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Area in {city}
            </label>
            <select
              value={isOtherArea ? "Other" : area}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "Other") {
                  onChange({ area: "Other", customArea: "" });
                } else {
                  onChange({ area: val, customArea: "" });
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            >
              <option value="">Select area…</option>
              {predefinedAreas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Pincode */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Pincode
            </label>
            <input
              type="text"
              value={pincode}
              maxLength={6}
              onChange={(e) =>
                onChange({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })
              }
              placeholder="e.g. 390007"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      )}

      {/* Custom Area text input if "Other" is chosen */}
      {isOtherArea && (
        <div>
          <label className="block text-[11px] font-bold text-slate-700 mb-1">
            Specify Custom Area / Locality
          </label>
          <input
            type="text"
            value={customArea || (area !== "Other" ? area : "")}
            onChange={(e) => onChange({ customArea: e.target.value, area: e.target.value })}
            placeholder="e.g. Near Akota Garden, Old Padra Road"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      )}
    </div>
  );
}
