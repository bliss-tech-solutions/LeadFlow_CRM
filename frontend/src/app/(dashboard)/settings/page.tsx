"use client";

import { useEffect, useRef, useState } from "react";
import Topbar from "../../../components/Topbar";
import { api } from "../../../lib/api";
import { getUser, saveSession } from "../../../lib/auth";
import {
  CheckCircle2,
  ImagePlus,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";

const MAX_PHOTO_SIZE = 1 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function SettingsPage() {
  const session = getUser();
  const [name, setName] = useState(session?.name || "");
  const [email, setEmail] = useState(session?.email || "");
  const [role, setRole] = useState(session?.role || "");
  const [photoUrl, setPhotoUrl] = useState(
    (session as any)?.profilePhotoUrl || "",
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    api("/users/me")
      .then((data) => {
        setName(data.user?.name || "");
        setEmail(data.user?.email || "");
        setRole(data.user?.role || "");
        setPhotoUrl(data.user?.profilePhotoUrl || "");
      })
      .catch((e) => setError(e?.message || "Unable to load profile"));
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const data = await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });

      const current = getUser();
      if (current) {
        saveSession(
          data.token || localStorage.getItem("leadflow_token") || "",
          {
            ...current,
            name: data.user.name,
            profilePhotoUrl: data.user.profilePhotoUrl || photoUrl || undefined,
          } as any,
        );
      }
      setMessage("Profile updated successfully.");
    } catch (e: any) {
      setError(e?.message || "Unable to update profile");
    } finally {
      setSaving(false);
    }
  }

  function uploadToS3(uploadUrl: string, file: File) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable)
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else
          reject(
            new Error(
              "AWS S3 upload failed. Check your S3 bucket CORS settings.",
            ),
          );
      };
      xhr.onerror = () =>
        reject(new Error("Unable to upload profile photo to AWS S3."));
      xhr.send(file);
    });
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    setMessage("");
    setError("");

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Profile photo must be JPG, PNG or WEBP.");
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setError("Profile photo must be smaller than 1 MB.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const presign = await api("/users/me/profile-photo/upload-url", {
        method: "POST",
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });

      await uploadToS3(presign.uploadUrl, file);

      const saved = await api("/users/me/profile-photo", {
        method: "PATCH",
        body: JSON.stringify({ key: presign.key }),
      });

      const nextUrl = saved.user?.profilePhotoUrl || presign.url;
      setPhotoUrl(nextUrl);
      const current = getUser();
      if (current) {
        saveSession(localStorage.getItem("leadflow_token") || "", {
          ...current,
          profilePhotoUrl: nextUrl,
        } as any);
      }
      setMessage("Profile photo updated successfully.");
    } catch (e: any) {
      setError(e?.message || "Unable to upload profile photo");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setUploading(true);
    setMessage("");
    setError("");
    try {
      await api("/users/me/profile-photo", { method: "DELETE" });
      setPhotoUrl("");
      const current = getUser();
      if (current) {
        saveSession(localStorage.getItem("leadflow_token") || "", {
          ...current,
          profilePhotoUrl: undefined,
        } as any);
      }
      setMessage("Profile photo removed.");
    } catch (e: any) {
      setError(e?.message || "Unable to remove profile photo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Topbar
        title="Settings"
        subtitle="Manage your profile, profile photo and account details."
      />

      <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
            <UserRound size={20} />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Profile</h2>
            <p className="text-xs text-slate-500">
              Update your display name and profile photo. Email remains
              read-only.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:items-center">
          <div className="relative grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-indigo-100 text-indigo-600 shadow-sm">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Profile"
                className="h-full w-full object-cover"
              />
            ) : (
              <UserRound size={34} />
            )}
            {uploading && (
              <div className="absolute inset-0 grid place-items-center bg-black/50 text-xs font-bold text-white">
                {uploadProgress}%
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <b className="block text-sm text-slate-900">Profile photo</b>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              JPG, PNG · maximum 2 MB.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  void uploadPhoto(e.target.files?.[0]);
                  e.currentTarget.value = "";
                }}
              />
              <button
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Upload size={14} />{" "}
                {uploading ? "Uploading..." : "Upload photo"}
              </button>
              {photoUrl && (
                <button
                  disabled={uploading}
                  onClick={() => void removePhoto()}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <label className="mt-5 block text-xs font-semibold text-slate-700">
          Full name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          />
        </label>
        <label className="mt-4 block text-xs font-semibold text-slate-700">
          Email
          <input
            value={email}
            readOnly
            className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
          />
        </label>
        <label className="mt-4 block text-xs font-semibold text-slate-700">
          Role
          <input
            value={role}
            readOnly
            className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500"
          />
        </label>

        {message && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={15} /> {message}
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
            <ImagePlus size={15} /> {error}
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <button
            disabled={saving || !name.trim()}
            onClick={save}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </section>
    </div>
  );
}
