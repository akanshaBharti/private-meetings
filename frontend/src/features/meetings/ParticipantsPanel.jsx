import { useCallback, useEffect, useMemo, useState } from "react";
import { IconCheck, IconClock, IconMail, IconRefresh, IconUserPlus, IconUsers, IconX } from "@tabler/icons-react";
import { API_ENDPOINTS } from "utilities/api";
import apiClient from "utilities/apiClient";

function endpoint(template, meetingId) {
  return template.replace(":meeting_id", meetingId);
}

function participantName(participant) {
  return participant.name || participant.guest_name || participant.guest_email || "Unnamed participant";
}

export default function ParticipantsPanel({ meeting, onClose, onChanged, canManage = false, publicMeetingCode = "" }) {
  const [detail, setDetail] = useState(meeting);
  const [guestEmails, setGuestEmails] = useState("");
  const [userIds, setUserIds] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = publicMeetingCode
        ? await apiClient.get(endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.LOOKUP, publicMeetingCode))
        : await apiClient.get(endpoint(API_ENDPOINTS.MEETINGS.GET_DETAIL, meeting.id));
      setDetail(response.data);
      setError("");
    } catch (requestError) {
      // A guest may have a stale public lookup while the meeting is ending.
      // Keep the participant snapshot already rendered instead of showing an
      // authenticated "Meeting not found" error in the public room.
      if (!publicMeetingCode) setError(requestError?.response?.data?.detail || "Could not load participants.");
    } finally {
      setLoading(false);
    }
  }, [meeting.id, publicMeetingCode]);

  useEffect(() => {
    load();
    if (!canManage || publicMeetingCode) return undefined;
    const interval = window.setInterval(load, 5000);
    return () => window.clearInterval(interval);
  }, [load, canManage, publicMeetingCode]);

  const participants = detail?.participants || [];
  const pending = useMemo(() => participants.filter((participant) => participant.join_status === "knocking"), [participants]);
  const active = useMemo(() => participants.filter((participant) => participant.is_active && participant.join_status !== "left"), [participants]);

  const addParticipants = async (event) => {
    event.preventDefault();
    setError("");
    const emails = guestEmails.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
    const ids = userIds.split(/[\s,;]+/).map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
    if (!emails.length && !ids.length) {
      setError("Add at least one email or user ID.");
      return;
    }
    setSaving(true);
    try {
      const response = await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_ADD_PARTICIPANTS, meeting.id), { guest_emails: emails, participants: ids });
      setDetail(response.data);
      setGuestEmails("");
      setUserIds("");
      onChanged?.(response.data);
    } catch (requestError) {
      const data = requestError?.response?.data;
      setError(data?.detail || Object.values(data || {}).flat()[0] || "Could not add participants.");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (participant, approve) => {
    setWorkingId(participant.id);
    setError("");
    try {
      const response = await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_ADMIT, meeting.id), { request_id: participant.id, approve });
      setDetail(response.data);
      onChanged?.(response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Could not update the join request.");
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-end bg-[#321b4d]/35 p-4 backdrop-blur-sm sm:p-6">
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden rounded-[1.75rem] border border-[#ead7e3] bg-[#fffafd] shadow-[0_24px_80px_rgba(50,27,77,0.2)]">
        <div className="flex items-start justify-between border-b border-[#ead7e3] p-6">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a1588b]">People in the room</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#321b4d]">{detail?.title || meeting.title}</h2><p className="mt-2 text-sm text-[#8a718a]">{detail?.counts?.live_participants || 0} live · {detail?.counts?.participants ?? active.length} added</p><div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#f3e7f2] px-3 py-1.5 text-xs font-semibold text-[#60486d]"><span className="rounded-full bg-[#321b4d] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white">Host</span>{detail?.host_info?.name || detail?.host_name || "Meeting host"}</div></div>
          <button onClick={onClose} aria-label="Close participants" className="rounded-lg p-2 text-[#9b8299] hover:bg-[#f8edf5] hover:text-[#321b4d]"><IconX size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {canManage && <form onSubmit={addParticipants} className="rounded-2xl border border-[#ead7e3] bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#60486d]"><IconUserPlus size={17} /> Invite people</div>
            <label className="mt-3 block text-sm font-medium text-[#60486d]">Invite by email<input value={guestEmails} onChange={(event) => setGuestEmails(event.target.value)} className="field" placeholder="person@example.com, teammate@example.com" /><span className="mt-1 block text-xs font-normal text-[#9b8299]">Registered users get the meeting in Scheduled Meetings; others join as guests.</span></label>
            <label className="mt-3 block text-sm font-medium text-[#60486d]">Registered user IDs <span className="font-normal text-[#a0879f]">(optional)</span><input value={userIds} onChange={(event) => setUserIds(event.target.value)} className="field" placeholder="12, 18" /></label>
            <button disabled={saving} className="button primary mt-4 flex items-center gap-2"><IconMail size={16} />{saving ? "Adding…" : "Add participants"}</button>
          </form>}

          {pending.length > 0 && <section className="mt-6"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-[#60486d]"><IconClock size={17} /> Waiting for approval <span className="rounded-full bg-[#f8dce9] px-2 py-0.5 text-xs text-[#a54477]">{pending.length}</span></h3></div>{!canManage && <p className="mt-2 text-xs text-[#9b8299]">Only the host can accept or deny join requests.</p>}<div className="mt-3 space-y-2">{pending.map((participant) => <div key={participant.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0cddd] bg-[#fff5f9] p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#321b4d]">{participantName(participant)}</p><p className="truncate text-xs text-[#9b8299]">{participant.email || "Guest"}</p></div>{canManage && <div className="flex shrink-0 gap-2"><button disabled={workingId === participant.id} onClick={() => decide(participant, true)} className="rounded-lg bg-[#321b4d] p-2 text-white" aria-label={`Admit ${participantName(participant)}`}><IconCheck size={16} /></button><button disabled={workingId === participant.id} onClick={() => decide(participant, false)} className="rounded-lg border border-[#e4c4d5] p-2 text-[#a23e59]" aria-label={`Deny ${participantName(participant)}`}><IconX size={16} /></button></div>}</div>)}</div></section>}

          <section className="mt-6"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold text-[#60486d]"><IconUsers size={17} /> Participants <span className="rounded-full bg-[#f3e7f2] px-2 py-0.5 text-xs text-[#745584]">{participants.length}</span></h3><button onClick={load} className="flex items-center gap-1 text-xs font-semibold text-[#9a527e] hover:text-[#321b4d]"><IconRefresh size={14} /> Refresh</button></div>{loading ? <p className="mt-3 rounded-xl bg-white p-4 text-sm text-[#9b8299]">Loading participants…</p> : <div className="mt-3 divide-y divide-[#f1e3ed] rounded-2xl border border-[#ead7e3] bg-white">{participants.length ? participants.map((participant) => { const isHostParticipant = participant.role === "host" || String(participant.user_id) === String(detail?.host_info?.id); return <div key={participant.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><div className="flex min-w-0 items-center gap-2"><p className="truncate text-sm font-semibold text-[#321b4d]">{participantName(participant)}</p>{isHostParticipant && <span className="shrink-0 rounded-full bg-[#321b4d] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-white">Host</span>}</div><p className="truncate text-xs text-[#9b8299]">{participant.email || "No email"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${participant.join_status === "joined" ? "bg-[#e9f8f0] text-[#23734a]" : participant.join_status === "left" ? "bg-[#f3edf4] text-[#806d83]" : participant.join_status === "knocking" ? "bg-[#fff0d7] text-[#9a651c]" : "bg-[#f3e7f2] text-[#745584]"}`}>{participant.join_status}</span></div>; }) : <p className="p-5 text-sm text-[#9b8299]">No participants have been added yet.</p>}</div>}</section>
        </div>
      </aside>
    </div>
  );
}
