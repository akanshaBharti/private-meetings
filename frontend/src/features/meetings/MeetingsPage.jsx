import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconCalendarEvent, IconCheck, IconClock, IconCopy, IconHistory, IconLink, IconPencil, IconPlayerPlay, IconRefresh, IconUsers, IconVideo } from "@tabler/icons-react";
import { AuthContext } from "context/AuthContext";
import apiClient from "utilities/apiClient";
import { API_ENDPOINTS } from "utilities/api";
import { toast } from "sonner";
import EditMeetingModal from "./EditMeetingModal";
import ParticipantsPanel from "./ParticipantsPanel";
import ScheduleMeetingModal from "./ScheduleMeetingModal";
import { copyMeetingLink, getMeetingJoinUrl } from "./meetingLink";

function formatDate(date, time) {
  const value = new Date(`${date}T${time || "00:00"}`);
  return Number.isNaN(value.getTime()) ? `${date} ${time || ""}` : value.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status) {
  return { live: "Live now", scheduled: "Scheduled", ended: "Ended", cancelled: "Cancelled" }[status] || status;
}

function requestResult(result, fallback) {
  if (result.status === "fulfilled") return result.value.data;
  return fallback;
}

function MeetingCard({ meeting, isScheduled, isHost, onJoin, onCancel, onEdit, onParticipants }) {
  const isLive = meeting.status === "live";
  const joinUrl = getMeetingJoinUrl(meeting.meeting_code);
  const invitedBy = !isHost ? (meeting.host_info?.name || "this person") : "";
  const [copied, setCopied] = useState(false);

  const copyJoinLink = async () => {
    try {
      await copyMeetingLink(meeting.meeting_code);
      setCopied(true);
      toast.success("Guest link copied");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy the guest link");
    }
  };

  return <article className="group rounded-2xl border border-[#ead7e3] bg-white p-5 shadow-[0_12px_34px_rgba(78,40,108,0.05)] transition duration-300 hover:-translate-y-0.5 hover:border-[#d19bb7] hover:shadow-[0_18px_40px_rgba(78,40,108,0.09)] motion-rise"><div className="flex flex-wrap items-start justify-between gap-5"><div className="flex min-w-0 gap-4"><span className={`mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${isLive ? "bg-[#f5d4e3] text-[#a54477]" : "bg-[#f3e7f2] text-[#8d65a7]"}`}><IconVideo size={20} /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-lg font-semibold tracking-[-0.03em] text-[#321b4d]">{meeting.title}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isLive ? "bg-[#f8d7e5] text-[#a54477]" : meeting.status === "cancelled" ? "bg-[#fff0f3] text-[#b04d68]" : "bg-[#f1e6f2] text-[#745584]"}`}>{statusLabel(meeting.status)}</span>{invitedBy && <span className="rounded-full bg-[#f8edf5] px-2.5 py-1 text-xs font-semibold text-[#92527d]">Invited by {invitedBy}</span>}</div><p className="mt-2 text-sm text-[#8a718a]">{formatDate(meeting.scheduled_date, meeting.start_time)} <span className="px-1 text-[#cdb6c9]">·</span> {meeting.duration_minutes} minutes</p><p className="mt-3 text-sm text-[#a0879f]">Code <span className="ml-1 rounded-md bg-[#fbf2f8] px-2 py-1 font-mono text-xs text-[#6e5079]">{meeting.meeting_code}</span></p>{isHost && <div className="mt-3 flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm"><IconLink size={15} className="shrink-0 text-[#a1588b]" /><span className="shrink-0 text-[#8a718a]">Guest link</span><span title={joinUrl} className="min-w-0 max-w-full truncate rounded-md bg-[#fbf2f8] px-2 py-1 font-mono text-xs text-[#6e5079] sm:max-w-[24rem]">{joinUrl}</span><button type="button" onClick={copyJoinLink} className="button secondary flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs" aria-label={`Copy guest link for ${meeting.title}`}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}{copied ? "Copied" : "Copy link"}</button></div>}</div></div><div className="flex shrink-0 flex-wrap justify-end gap-2">{isScheduled && <button onClick={onJoin} className="button primary flex items-center gap-2 rounded-xl px-4"><IconPlayerPlay size={16} />{isLive ? "Join now" : "Join"}</button>}{isHost && <><button onClick={onParticipants} className="button secondary flex items-center gap-2 rounded-xl px-3"><IconUsers size={16} />People</button>{meeting.status === "scheduled" && <button onClick={onEdit} className="button secondary flex items-center gap-2 rounded-xl px-3"><IconPencil size={16} />Edit</button>}{meeting.status === "scheduled" && <button onClick={onCancel} className="button secondary rounded-xl px-3">Cancel</button>}</>}</div></div></article>;
}

export default function MeetingsPage() {
  const { user, logoutUser } = useContext(AuthContext);
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [counts, setCounts] = useState({ upcoming: 0, past: 0, recurring: 0 });
  const [videoReady, setVideoReady] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [editingMeeting, setEditingMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState("scheduled");

  const load = useCallback(async () => {
    setLoading(true);
    const [listResult, countsResult, upcomingResult, seriesResult, videoResult] = await Promise.allSettled([
      apiClient.get(API_ENDPOINTS.MEETINGS.GET_LIST),
      apiClient.get(API_ENDPOINTS.MEETINGS.GET_COUNTS),
      apiClient.get(API_ENDPOINTS.MEETINGS.GET_UPCOMING),
      apiClient.get(API_ENDPOINTS.MEETINGS.GET_SERIES),
      apiClient.get(API_ENDPOINTS.HEALTH.VIDEO),
    ]);
    const listData = requestResult(listResult, { results: [], tab_counts: {} });
    const countsData = requestResult(countsResult, listData.tab_counts || {});
    const upcomingData = requestResult(upcomingResult, { results: [] });
    const seriesData = requestResult(seriesResult, []);
    setMeetings(listData.results || []);
    setUpcomingMeetings(upcomingData.results || []);
    setCounts({ upcoming: countsData.upcoming ?? 0, past: countsData.past ?? 0, recurring: countsData.recurring ?? seriesData.length ?? 0 });
    setVideoReady(videoResult.status === "fulfilled" && videoResult.value.data?.ready === true);
    if (listResult.status === "rejected") setError(listResult.reason?.response?.data?.detail || "Could not load meetings.");
    else setError("");
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pastMeetings = useMemo(() => meetings.filter((meeting) => ["ended", "cancelled"].includes(meeting.status)), [meetings]);
  const visibleMeetings = activeTab === "scheduled" ? upcomingMeetings : pastMeetings;

  const startInstant = async () => {
    const roomTab = window.open("about:blank", "_blank");
    if (roomTab) roomTab.opener = null;
    try {
      const response = await apiClient.post(API_ENDPOINTS.MEETINGS.POST_INSTANT, { title: "Instant meeting" });
      if (roomTab) {
        const roomUrl = new URL(`/meetings/${response.data.id}/room`, window.location.origin);
        roomUrl.searchParams.set("meeting_tab", "1");
        roomTab.location.href = roomUrl.toString();
      }
      else navigate(`/meetings/${response.data.id}/room`);
    } catch (requestError) {
      roomTab?.close();
      setError(requestError?.response?.data?.detail || "Could not start meeting.");
    }
  };

  const cancel = async (meeting) => {
    if (!window.confirm(`Cancel “${meeting.title}”?`)) return;
    try {
      await apiClient.delete(API_ENDPOINTS.MEETINGS.DELETE.replace(":meeting_id", meeting.id));
      load();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Could not cancel meeting.");
    }
  };

  return <main className="min-h-screen bg-[#fff9fc] text-[#321b4d]"><header className="border-b border-[#ead7e3] bg-white/80 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8"><Link to="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#321b4d] text-[#f7d8e7]"><IconVideo size={21} /></span><span className="font-semibold tracking-[-0.03em]">Private Meetings</span></Link><div className="flex items-center gap-3"><span className={`hidden items-center gap-1.5 text-xs font-semibold sm:flex ${videoReady === false ? "text-[#b04d68]" : "text-[#5f876b]"}`}><span className={`h-2 w-2 rounded-full ${videoReady === false ? "bg-[#d87d91]" : videoReady === true ? "bg-[#63ad7d]" : "bg-[#d5b6cd]"}`} />{videoReady === false ? "Video needs setup" : videoReady === true ? "Video ready" : "Checking video"}</span><span className="hidden text-sm text-[#8a718a] sm:inline">{user?.name || user?.email}</span><button onClick={logoutUser} className="button secondary">Log out</button></div></div></header><section className="relative mx-auto max-w-6xl overflow-hidden px-5 pb-16 pt-10 lg:px-8 lg:pt-14"><div className="pointer-events-none absolute right-[-12%] top-[-8%] h-96 w-96 rounded-full bg-[#f2dcff]/70 blur-3xl ambient-drift" /><div className="relative z-[1] flex flex-wrap items-end justify-between gap-6"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#a1588b]">Your workspace</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Good to see you, {user?.name?.split(" ")[0] || "there"}.</h1><p className="mt-4 max-w-xl text-base leading-7 text-[#8a718a]">A clear view of what is happening now, what is next, and what you have already wrapped up.</p></div><div className="flex gap-2"><button onClick={startInstant} className="button secondary flex items-center gap-2 bg-white"><IconPlayerPlay size={16} /> Start now</button><button onClick={() => setShowSchedule(true)} className="button primary flex items-center gap-2"><IconCalendarEvent size={16} /> Schedule meeting</button></div></div><div className="relative z-[1] mt-10 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-[#ead7e3] bg-white p-5"><p className="text-sm text-[#9b8299]">Scheduled</p><p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{counts.upcoming}</p><p className="mt-1 text-xs text-[#a0879f]">Upcoming and live rooms</p></div><div className="rounded-2xl border border-[#ead7e3] bg-white p-5"><p className="text-sm text-[#9b8299]">Past meetings</p><p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{counts.past}</p><p className="mt-1 text-xs text-[#a0879f]">Your meeting history</p></div><div className="rounded-2xl border border-[#43275a] bg-[#321b4d] p-5 text-[#fff9fc]"><p className="text-sm text-[#d8bcd7]">Recurring series</p><p className="mt-3 text-3xl font-semibold tracking-[-0.05em]">{counts.recurring}</p><p className="mt-1 text-xs text-[#d8bcd7]">Repeatable meeting plans</p></div></div>{error && <p className="relative z-[1] mt-6 rounded-xl border border-[#efc7d2] bg-[#fff2f5] px-4 py-3 text-sm text-[#a23e59]">{error}</p>}<div className="relative z-[1] mt-10"><div className="relative flex gap-1 border-b border-[#ead7e3]" role="tablist" aria-label="Meeting history"><span className="absolute bottom-0 h-0.5 w-40 bg-[#c979a3] transition-transform duration-300 ease-out tab-spring sm:w-48" style={{ transform: activeTab === "past" ? "translateX(100%)" : "translateX(0)" }} />{[["scheduled", "Scheduled Meetings", counts.upcoming], ["past", "Past Meetings", counts.past]].map(([tab, label, count]) => <button key={tab} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className={`relative z-10 border-b-2 border-transparent px-1 pb-4 pr-5 text-sm font-bold transition ${activeTab === tab ? "text-[#321b4d]" : "text-[#a0879f] hover:text-[#60486d]"}`}>{label} <span className="ml-1 rounded-full bg-[#f3e7f2] px-2 py-1 text-xs">{count}</span></button>)}</div><div className="mt-5 flex items-center justify-between"><p className="flex items-center gap-2 text-sm text-[#8a718a]"><IconClock size={16} />{activeTab === "scheduled" ? "Upcoming and live rooms" : "A record of conversations you have finished"}</p><button onClick={load} className="flex items-center gap-2 text-sm font-semibold text-[#9a527e] hover:text-[#321b4d]"><IconRefresh size={16} /> Refresh</button></div><div className="mt-4 grid gap-3">{loading ? <div className="rounded-2xl border border-dashed border-[#d9bfd1] bg-white p-12 text-center text-sm text-[#9b8299]">Loading your meetings…</div> : visibleMeetings.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d9bfd1] bg-white p-12 text-center"><IconHistory size={28} className="mx-auto text-[#c38aaa]" /><p className="mt-4 text-base font-semibold text-[#60486d]">{activeTab === "scheduled" ? "No scheduled meetings yet" : "No past meetings yet"}</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#9b8299]">{activeTab === "scheduled" ? "Schedule a conversation for later or start an instant room right now." : "When a meeting ends, it will appear here for easy reference."}</p>{activeTab === "scheduled" && <button onClick={() => setShowSchedule(true)} className="button primary mt-5">Schedule your first meeting</button>}</div> : visibleMeetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} isScheduled={activeTab === "scheduled"} isHost={meeting.host_info?.id === user?.id} onJoin={() => navigate(`/meetings/${meeting.id}/room`)} onCancel={() => cancel(meeting)} onEdit={() => setEditingMeeting(meeting)} onParticipants={() => setSelectedMeeting(meeting)} />)}</div></div></section>{showSchedule && <ScheduleMeetingModal onClose={() => setShowSchedule(false)} onCreated={load} />}{editingMeeting && <EditMeetingModal meeting={editingMeeting} onClose={() => setEditingMeeting(null)} onUpdated={load} />}{selectedMeeting && <ParticipantsPanel meeting={selectedMeeting} onClose={() => setSelectedMeeting(null)} onChanged={load} />}</main>;
}
