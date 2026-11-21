import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { MapPin, ChevronDown, Check } from "lucide-react-native";
import { Field, SelectSheet, cx } from "./index";
import { useTheme } from "./theme";
import {
  STATES,
  GUJARAT_CITIES,
  getCitiesForState,
  getAreasForCity,
} from "../lib/locations";

export type LocationValues = {
  state?: string;
  city?: string;
  area?: string;
  pincode?: string;
};

export function LocationSelector({
  value,
  onChange,
}: {
  value: LocationValues;
  onChange: (patch: Partial<LocationValues>) => void;
}) {
  const { c } = useTheme();
  const state = value.state || "Gujarat";
  const isGujarat = state.trim().toLowerCase().startsWith("guj");
  const city = value.city || "";
  const area = value.area || "";
  const pincode = value.pincode || "";

  const [stateSheetOpen, setStateSheetOpen] = useState(false);
  const [citySheetOpen, setCitySheetOpen] = useState(false);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const [customAreaMode, setCustomAreaMode] = useState(false);

  const availableCities = getCitiesForState(state);
  const predefinedAreas = getAreasForCity(city);

  return (
    <View className="mb-3.5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
      <View className="mb-2.5 flex-row items-center gap-1.5">
        <MapPin size={16} color={c.brand} />
        <Text className="text-[13px] font-bold text-slate-800 dark:text-slate-200">
          Location &amp; Address Details
        </Text>
      </View>

      {/* 1. Indian State Dropdown */}
      <View className="mb-3">
        <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
          State (India)
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select State"
          onPress={() => setStateSheetOpen(true)}
          className="min-h-[46px] flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800"
        >
          <Text className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
            {state || "Select State…"}
          </Text>
          <ChevronDown size={18} color={c.faint} />
        </Pressable>

        <SelectSheet
          visible={stateSheetOpen}
          onClose={() => setStateSheetOpen(false)}
          title="Select State"
          options={STATES.map((s) => ({
            value: s,
            label: s === "Gujarat" ? "Gujarat (Default)" : s,
          }))}
          value={state}
          onSelect={(selectedState) => {
            const nextCities = getCitiesForState(selectedState);
            onChange({
              state: selectedState,
              city: nextCities[0] || "",
              area: "",
            });
            setCustomAreaMode(false);
          }}
        />
      </View>

      {/* 2. City Dropdown (Gujarat Restricted: Ahmedabad, Vadodara, Gandhinagar, Surat) */}
      <View className="mb-3">
        <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
          {isGujarat ? "City (Gujarat: 4 Major Cities)" : "City"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Select City"
          onPress={() => setCitySheetOpen(true)}
          className="min-h-[46px] flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800"
        >
          <Text
            className={cx(
              "text-[14px]",
              city ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400",
            )}
          >
            {city || "Select City…"}
          </Text>
          <ChevronDown size={18} color={c.faint} />
        </Pressable>

        <SelectSheet
          visible={citySheetOpen}
          onClose={() => setCitySheetOpen(false)}
          title={isGujarat ? "Select Gujarat City" : "Select City"}
          options={availableCities.map((ct) => ({
            value: ct,
            label: ct,
          }))}
          value={city}
          onSelect={(selectedCity) => {
            onChange({
              city: selectedCity,
              area: "",
            });
            setCustomAreaMode(false);
          }}
        />
      </View>

      {/* 3. Predefined Area Dropdown (Based on Selected City) */}
      {city ? (
        <View className="mb-3">
          <Text className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
            Area in {city}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select Area"
            onPress={() => setAreaSheetOpen(true)}
            className="min-h-[46px] flex-row items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800"
          >
            <Text
              className={cx(
                "text-[14px]",
                area ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400",
              )}
            >
              {area || `Select area in ${city}…`}
            </Text>
            <ChevronDown size={18} color={c.faint} />
          </Pressable>

          {/* Custom Area Fallback when 'Other' is picked */}
          {(customAreaMode || (area && !predefinedAreas.includes(area))) && (
            <View className="mt-2.5">
              <Field
                label="Custom Area / Colony Name"
                placeholder="Enter specific area / landmark..."
                value={area === "Other" ? "" : area}
                onChangeText={(text) => onChange({ area: text })}
              />
            </View>
          )}

          <SelectSheet
            visible={areaSheetOpen}
            onClose={() => setAreaSheetOpen(false)}
            title={`Select Area in ${city}`}
            options={predefinedAreas.map((a) => ({
              value: a,
              label: a,
            }))}
            value={area}
            onSelect={(selectedArea) => {
              if (selectedArea === "Other") {
                setCustomAreaMode(true);
                onChange({ area: "" });
              } else {
                setCustomAreaMode(false);
                onChange({ area: selectedArea });
              }
            }}
          />
        </View>
      ) : null}

      {/* 4. 6-Digit Indian Postal Pincode */}
      <Field
        label="Pincode"
        placeholder="6-digit PIN code (e.g. 390007, 380015)"
        value={pincode}
        onChangeText={(text) => onChange({ pincode: text.replace(/\D/g, "").slice(0, 6) })}
        keyboardType="number-pad"
        maxLength={6}
      />
    </View>
  );
}
