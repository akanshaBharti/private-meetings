import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconActivity, IconCheck, IconCopy, IconPhoneOff, IconShieldLock, IconUsers } from "@tabler/icons-react";
import apiClient from "utilities/apiClient";
import { API_ENDPOINTS } from "utilities/api";
import JitsiMeetingFrame from "./JitsiMeetingFrame";
import ParticipantsPanel from "./ParticipantsPanel";
import { copyMeetingLink } from "./meetingLink";
import { closeMeetingTab } from "./meetingWindow";
import { toast } from "sonner";

function endpoint(template, meetingCode) {
  return template.replace(":meeting_code", meetingCode);
}

export default function PublicMeetingRoom() {
  const { meetingCode } = useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", pin: "" });
  const [guestSessionToken, setGuestSessionToken] = useState("");
  const [joinStatus, setJoinStatus] = useState("unknown");
  const [error, setError] = useState("");
  const [showParticipants, setShowParticipants] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const leftRef = useRef(false);
  const guestFormRef = useRef(null);
  const admissionJoinRef = useRef(false);

  useEffect(() => {
    apiClient.get(endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.LOOKUP, meetingCode)).then((response) => setMeeting(response.data)).catch(() => setError("Meeting not found."));
  }, [meetingCode]);

  const checkJoinStatus = useCallback(async () => {
    if (!guestSessionToken) return;
    try {
      const response = await apiClient.get(`${endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.JOIN_STATUS, meetingCode)}?guest_session_token=${encodeURIComponent(guestSessionToken)}`);
      const status = response.data?.status || "unknown";
      setJoinStatus(status);
      if (status === "invited" && guestFormRef.current && !admissionJoinRef.current) {
        admissionJoinRef.current = true;
        try {
          const joined = await apiClient.post(endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.JOIN, meetingCode), guestFormRef.current);
          setMeeting(joined.data.meeting ? { ...joined.data.meeting, video: joined.data.video } : joined.data);
          setJoinStatus(joined.data.join_status || "joined");
        } finally {
          admissionJoinRef.current = false;
        }
      }
      if (status === "denied") setError("The host denied your request to join this meeting.");
    } catch {
      setJoinStatus("unknown");
    }
  }, [guestSessionToken, meetingCode]);

  const sendHeartbeat = useCallback(async () => {
    if (!guestSessionToken) return;
    try {
      await apiClient.post(endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.HEARTBEAT, meetingCode), { guest_session_token: guestSessionToken });
    } catch {
      if (joinStatus === "joined") setJoinStatus("reconnecting");
    }
  }, [guestSessionToken, meetingCode, joinStatus]);

  useEffect(() => {
    if (!guestSessionToken) return undefined;
    checkJoinStatus();
    const statusInterval = window.setInterval(checkJoinStatus, 5000);
    const heartbeatInterval = window.setInterval(sendHeartbeat, 30000);
    return () => {
      window.clearInterval(statusInterval);
      window.clearInterval(heartbeatInterval);
    };
  }, [guestSessionToken, checkJoinStatus, sendHeartbeat]);

  const leave = useCallback(async () => {
    if (leftRef.current) return;
    leftRef.current = true;
    if (guestSessionToken) {
      try { await apiClient.post(endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.LEAVE, meetingCode), { guest_session_token: guestSessionToken }); } catch { /* the room is already closing */ }
    }
    closeMeetingTab(() => navigate("/"));
  }, [guestSessionToken, meetingCode, navigate]);

  const join = async (event) => {
    event.preventDefault();
    setError("");
    guestFormRef.current = form;
    try {
      const response = await apiClient.post(endpoint(API_ENDPOINTS.PUBLIC_MEETINGS.JOIN, meetingCode), form);
      setGuestSessionToken(response.data.guest_session_token || "");
      setJoinStatus(response.data.join_status || "joined");
      setMeeting(response.data.meeting ? { ...response.data.meeting, video: response.data.video } : response.data);
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || "Could not join meeting.");
    }
  };

  const copyGuestLink = async () => {
    try {
      await copyMeetingLink(meetingCode);
      setLinkCopied(true);
      toast.success("Meeting link copied");
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      toast.error("Could not copy the meeting link");
    }
  };

  if (!meeting) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">{error || "Loading meeting…"}</main>;
  if (!meeting.video && !guestSessionToken) return <main className="flex min-h-screen items-center justify-center bg-[#fff9fc] p-4"><form onSubmit={join} className="w-full max-w-md space-y-4 rounded-[1.75rem] border border-[#ead7e3] bg-white p-6 shadow-[0_24px_80px_rgba(50,27,77,0.14)]"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3e7f2] text-[#8d65a7]"><IconShieldLock size={23} /></div><h1 className="text-2xl font-semibold tracking-[-0.04em] text-[#321b4d]">Join {meeting.title}</h1><p className="text-sm leading-6 text-[#8a718a]">Enter your details to join this private room.</p>{error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<label className="block text-sm font-medium text-[#60486d]">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="field" /></label><label className="block text-sm font-medium text-[#60486d]">Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="field" /></label>{meeting.external_pin_required && <label className="block text-sm font-medium text-[#60486d]">PIN<input required value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="field" /></label>}<button className="button primary w-full">Request to join</button></form></main>;
  if (joinStatus === "denied") return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white"><div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl"><p className="text-xl font-semibold">Request denied</p><p className="mt-3 text-sm leading-6 text-white/65">{error || "The host denied your request to join this meeting."}</p><button onClick={leave} className="mt-6 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">Close</button></div></main>;
  if (["knocking", "invited"].includes(joinStatus)) return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-white"><div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl"><p className="text-xl font-semibold">Waiting for the host</p><p className="mt-3 text-sm leading-6 text-white/65">Your request to join has been sent. You can enter as soon as the host accepts it.</p><button onClick={leave} className="mt-6 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">Cancel request</button></div></main>;
  return <main className="relative min-h-screen bg-slate-950"><div className="absolute left-4 top-4 z-10 rounded-lg bg-black/60 px-3 py-2 text-sm text-white shadow-lg"><p className="font-semibold">{meeting.title}</p><p className="mt-1 flex items-center gap-1 text-xs text-white/70"><IconActivity size={13} />Connected</p></div><div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-2"><button onClick={() => setShowParticipants(true)} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"><IconUsers size={16} /> People</button><button type="button" onClick={copyGuestLink} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20" aria-label="Copy meeting link">{linkCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}{linkCopied ? "Copied" : "Copy meet link"}</button><button onClick={leave} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"><IconPhoneOff size={16} /> Leave meeting</button></div><JitsiMeetingFrame video={meeting.video} meetingTitle={meeting.title} onLeft={leave} />{showParticipants && <ParticipantsPanel meeting={meeting} publicMeetingCode={meetingCode} canManage={false} onClose={() => setShowParticipants(false)} />}</main>;
}
