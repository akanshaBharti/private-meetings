import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IconActivity, IconCheck, IconCopy, IconPhoneOff, IconUsers } from "@tabler/icons-react";
import { AuthContext } from "context/AuthContext";
import apiClient from "utilities/apiClient";
import { API_ENDPOINTS } from "utilities/api";
import JitsiMeetingFrame from "./JitsiMeetingFrame";
import ParticipantsPanel from "./ParticipantsPanel";
import { copyMeetingLink } from "./meetingLink";
import { closeMeetingTab } from "./meetingWindow";
import { toast } from "sonner";

function endpoint(template, meetingId) {
  return template.replace(":meeting_id", meetingId);
}

export default function MeetingRoom() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState("");
  const [heartbeatState, setHeartbeatState] = useState("connecting");
  const [joinStatus, setJoinStatus] = useState("joining");
  const [counts, setCounts] = useState({ live_participants: 0, participants: 0 });
  const [showParticipants, setShowParticipants] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const leavingRef = useRef(false);

  useEffect(() => {
    let active = true;
    const join = async () => {
      try {
        const response = await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_JOIN, meetingId));
        if (active) {
          setMeeting(response.data);
          setCounts(response.data.counts || {});
          setJoinStatus(response.data.viewer_join_status || "joined");
        }
      } catch (requestError) {
        if (active) setError(requestError?.response?.data?.detail || "Could not join this meeting.");
      }
    };
    join();
    return () => { active = false; };
  }, [meetingId]);

  const sendHeartbeat = useCallback(async () => {
    try {
      const response = await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_HEARTBEAT, meetingId));
      setHeartbeatState("connected");
      if (response.data?.counts) setCounts(response.data.counts);
    } catch {
      setHeartbeatState("reconnecting");
    }
  }, [meetingId]);

  useEffect(() => {
    if (!meeting) return undefined;
    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 30000);
    return () => window.clearInterval(interval);
  }, [meeting, sendHeartbeat]);

  useEffect(() => {
    if (!meeting || joinStatus !== "knocking") return undefined;
    let active = true;
    const checkRequest = async () => {
      try {
        const response = await apiClient.get(endpoint(API_ENDPOINTS.MEETINGS.GET_DETAIL, meetingId));
        const status = response.data?.viewer_join_status;
        if (!active) return;
        if (status === "invited") {
          const joined = await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_JOIN, meetingId));
          if (active) {
            setMeeting(joined.data);
            setCounts(joined.data.counts || {});
            setJoinStatus(joined.data.viewer_join_status || "joined");
          }
        } else if (status) {
          setJoinStatus(status);
        }
      } catch (requestError) {
        if (active && requestError?.response?.status === 403) {
          setError(requestError?.response?.data?.detail || "Your request to join was denied.");
        }
      }
    };
    checkRequest();
    const interval = window.setInterval(checkRequest, 5000);
    return () => { active = false; window.clearInterval(interval); };
  }, [meeting, joinStatus, meetingId]);

  const finishRoom = useCallback(() => closeMeetingTab(() => navigate("/meetings")), [navigate]);

  const leave = useCallback(async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    try { await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_LEAVE, meetingId)); } catch { /* the room is already closing */ }
    finishRoom();
  }, [meetingId, finishRoom]);

  const endForEveryone = async () => {
    if (!window.confirm("End this meeting for everyone?")) return;
    leavingRef.current = true;
    try {
      await apiClient.post(endpoint(API_ENDPOINTS.MEETINGS.POST_END, meetingId));
      finishRoom();
    } catch (requestError) {
      leavingRef.current = false;
      setError(requestError?.response?.data?.detail || "Could not end the meeting.");
    }
  };

  const copyGuestLink = async () => {
    try {
      await copyMeetingLink(meeting.meeting_code);
      setLinkCopied(true);
      toast.success("Guest link copied");
      window.setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      toast.error("Could not copy the guest link");
    }
  };

  if (error) return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6"><div className="rounded-xl bg-white p-6 text-center"><p className="text-red-700">{error}</p><button onClick={() => navigate("/meetings")} className="button primary mt-4">Back to meetings</button></div></main>;
  if (!meeting) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Joining meeting…</main>;

  const isHost = meeting.viewer_is_host ?? meeting.host_info?.id === user?.id;
  const isWaiting = joinStatus === "knocking";
  return <main className="relative min-h-screen bg-slate-950"><div className="absolute left-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-lg bg-black/60 px-3 py-2 text-sm text-white shadow-lg"><p className="font-semibold">{meeting.title}</p><p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70"><span className="flex items-center gap-1"><IconUsers size={13} />{counts.live_participants || 0} live</span><span className="flex items-center gap-1"><IconActivity size={13} />{isWaiting ? "Waiting for host approval" : heartbeatState === "connected" ? "Connected" : heartbeatState === "reconnecting" ? "Reconnecting…" : "Joining…"}</span></p></div><div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-2"><button onClick={() => setShowParticipants(true)} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"><IconUsers size={16} /> People</button><button type="button" onClick={copyGuestLink} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20" aria-label="Copy meeting link">{linkCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}{linkCopied ? "Copied" : "Copy meet link"}</button><button onClick={leave} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/20"><IconPhoneOff size={16} /> Leave meeting</button>{isHost && <button onClick={endForEveryone} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500">End meeting for all</button>}</div>{isWaiting ? <div className="flex min-h-screen items-center justify-center px-6 text-center text-white"><div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl"><p className="text-xl font-semibold">Waiting for the host</p><p className="mt-3 text-sm leading-6 text-white/65">Your request to join has been sent. You can enter as soon as the host accepts it.</p></div></div> : <JitsiMeetingFrame video={meeting.video} meetingTitle={meeting.title} onLeft={leave} className="min-h-screen" />}{showParticipants && <ParticipantsPanel meeting={meeting} canManage={isHost} onClose={() => setShowParticipants(false)} onChanged={(updated) => { setMeeting(updated); setCounts(updated.counts || counts); }} />}</main>;
}
