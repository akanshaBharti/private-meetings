import { useState } from "react";
import { API_ENDPOINTS } from "utilities/api";
import apiClient from "utilities/apiClient";

export default function ScheduleMeetingModal({ onClose, onCreated }) {
  const now = new Date();
  const [form, setForm] = useState({
    title: "",
    description: "",
    scheduled_date: now.toISOString().slice(0, 10),
    start_time: `${String((now.getHours() + 1) % 24).padStart(2, "0")}:00`,
    duration_minutes: 30,
    access_type: "trusted",
    external_pin: "",
    is_recurring: false,
    end_date: "",
    guest_emails: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    const roomTab = form.is_recurring ? null : window.open("about:blank", "_blank");
    if (roomTab) roomTab.opener = null;
    try {
      const guestEmails = form.guest_emails.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
      const endpoint = form.is_recurring ? API_ENDPOINTS.MEETINGS.POST_SERIES : API_ENDPOINTS.MEETINGS.POST_CREATE;
      const payload = form.is_recurring
        ? { title: form.title, description: form.description, start_date: form.scheduled_date, start_time: form.start_time, duration_minutes: Number(form.duration_minutes), recurrence_rule: "FREQ=DAILY", end_date: form.end_date || null }
        : { ...form, duration_minutes: Number(form.duration_minutes), guest_emails: guestEmails };
      const response = await apiClient.post(endpoint, payload);
      onCreated(response.data);
      if (roomTab && response.data?.id) roomTab.location.href = new URL(`/meetings/${response.data.id}/room`, window.location.origin).toString();
      onClose();
    } catch (requestError) {
      roomTab?.close();
      const data = requestError?.response?.data;
      setError(data?.detail || Object.values(data || {}).flat()[0] || "Could not schedule meeting.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#321b4d]/45 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-[1.75rem] border border-[#ead7e3] bg-[#fffafd] p-6 shadow-[0_24px_80px_rgba(50,27,77,0.2)]">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[#321b4d]">Schedule a meeting</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-[#9b8299] hover:text-[#321b4d]">Close</button>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium text-[#60486d]">Title<input name="title" value={form.title} onChange={update} required className="field" /></label>
        <label className="block text-sm font-medium text-[#60486d]">Description<textarea name="description" value={form.description} onChange={update} className="field min-h-20" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium text-[#60486d]">Date<input type="date" name="scheduled_date" value={form.scheduled_date} onChange={update} required className="field" /></label>
          <label className="text-sm font-medium text-[#60486d]">Start<input type="time" name="start_time" value={form.start_time} onChange={update} required className="field" /></label>
          <label className="text-sm font-medium text-[#60486d]">Minutes<input type="number" min="1" max="1440" name="duration_minutes" value={form.duration_minutes} onChange={update} className="field" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#60486d]">Access<select name="access_type" value={form.access_type} onChange={update} className="field"><option value="trusted">Invited or host-approved</option><option value="open">Anyone with the link (host approval)</option></select></label>
          <label className="text-sm font-medium text-[#60486d]">PIN (optional)<input name="external_pin" value={form.external_pin} onChange={update} inputMode="numeric" className="field" placeholder="6 digits" /></label>
        </div>
        <label className="flex items-center gap-3 rounded-xl border border-[#ead7e3] bg-white px-3.5 py-3 text-sm font-semibold text-[#60486d]"><input type="checkbox" name="is_recurring" checked={form.is_recurring} onChange={(event) => setForm((current) => ({ ...current, is_recurring: event.target.checked }))} className="h-4 w-4 accent-[#321b4d]" /> Repeat this meeting daily</label>
        {form.is_recurring ? <label className="block text-sm font-medium text-[#60486d]">Repeat until <span className="font-normal text-[#a0879f]">(optional)</span><input type="date" name="end_date" value={form.end_date} onChange={update} className="field" /></label> : <label className="block text-sm font-medium text-[#60486d]">Invite by email <span className="font-normal text-[#a0879f]">(optional)</span><input name="guest_emails" value={form.guest_emails} onChange={update} className="field" placeholder="registered users or guests" /><span className="mt-1 block text-xs font-normal text-[#9b8299]">Registered users will see this meeting in Scheduled Meetings. Other addresses receive the guest-link flow.</span></label>}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="button secondary">Cancel</button><button disabled={saving} className="button primary">{saving ? "Scheduling…" : "Schedule meeting"}</button></div>
      </form>
    </div>
  );
}
