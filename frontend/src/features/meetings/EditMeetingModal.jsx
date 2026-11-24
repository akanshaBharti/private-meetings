import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { API_ENDPOINTS } from "utilities/api";
import apiClient from "utilities/apiClient";

function initialForm(meeting) {
  return {
    title: meeting?.title || "",
    description: meeting?.description || "",
    scheduled_date: meeting?.scheduled_date || "",
    start_time: meeting?.start_time?.slice(0, 5) || "",
    duration_minutes: meeting?.duration_minutes || 30,
    access_type: meeting?.access_type || "trusted",
  };
}

export default function EditMeetingModal({ meeting, onClose, onUpdated }) {
  const [form, setForm] = useState(() => initialForm(meeting));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(initialForm(meeting)), [meeting]);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await apiClient.patch(API_ENDPOINTS.MEETINGS.PATCH_UPDATE.replace(":meeting_id", meeting.id), {
        ...form,
        duration_minutes: Number(form.duration_minutes),
      });
      onUpdated(response.data);
      onClose();
    } catch (requestError) {
      const data = requestError?.response?.data;
      setError(data?.detail || Object.values(data || {}).flat()[0] || "Could not update meeting.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#321b4d]/45 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-[1.75rem] border border-[#ead7e3] bg-[#fffafd] p-6 shadow-[0_24px_80px_rgba(50,27,77,0.2)]">
        <div className="flex items-center justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a1588b]">Meeting settings</p><h2 className="mt-1 text-xl font-semibold text-[#321b4d]">Edit meeting</h2></div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-[#9b8299] hover:bg-[#f8edf5] hover:text-[#321b4d]"><IconX size={18} /></button>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium text-[#60486d]">Title<input name="title" value={form.title} onChange={update} required className="field" /></label>
        <label className="block text-sm font-medium text-[#60486d]">Description<textarea name="description" value={form.description} onChange={update} className="field min-h-20" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium text-[#60486d]">Date<input type="date" name="scheduled_date" value={form.scheduled_date} onChange={update} required className="field" /></label>
          <label className="text-sm font-medium text-[#60486d]">Start<input type="time" name="start_time" value={form.start_time} onChange={update} required className="field" /></label>
          <label className="text-sm font-medium text-[#60486d]">Minutes<input type="number" min="1" max="1440" name="duration_minutes" value={form.duration_minutes} onChange={update} required className="field" /></label>
        </div>
        <label className="block text-sm font-medium text-[#60486d]">Access<select name="access_type" value={form.access_type} onChange={update} className="field"><option value="trusted">Invited or host-approved</option><option value="open">Anyone with the link (host approval)</option></select></label>
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="button secondary">Cancel</button><button disabled={saving} className="button primary">{saving ? "Saving…" : "Save changes"}</button></div>
      </form>
    </div>
  );
}
