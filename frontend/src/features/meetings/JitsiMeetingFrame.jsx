import { useEffect, useRef, useState } from "react";

const scripts = new Map();

function loadScript(domain) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (scripts.has(domain)) return scripts.get(domain);
  const scriptUrl = `https://${domain}/external_api.js`;
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not reach the meeting server at ${domain}.`));
    document.body.appendChild(script);
  }).catch((error) => {
    // Do not permanently cache a failed load. This lets a retry work after a
    // local Jitsi service is started or a transient network error clears.
    scripts.delete(domain);
    throw error;
  });
  scripts.set(domain, promise);
  return promise;
}

export default function JitsiMeetingFrame({ video, meetingTitle, onJoined, onLeft, className = "" }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!video?.enabled || !video?.domain || !video?.roomName) {
      setError(video?.reason || "Video is not configured for this environment.");
      return undefined;
    }
    setError("");
    let disposed = false;
    loadScript(video.domain).then(() => {
      if (disposed || !containerRef.current) return;
      apiRef.current = new window.JitsiMeetExternalAPI(video.domain, {
        roomName: video.roomName,
        parentNode: containerRef.current,
        jwt: video.jwt || undefined,
        userInfo: { displayName: video.displayName || "Participant", email: video.email || "" },
        configOverwrite: {
          prejoinConfig: { enabled: false },
          // Jitsi's bundled participant menu is not consistently role-aware
          // in this self-hosted build. Guests must not receive host actions.
          remoteVideoMenu: { disabled: video.moderator !== true },
        },
        // The embedded hang-up control opens Jitsi's dialog, which includes
        // "End meeting for all" when the end-conference feature is enabled.
        // Keep that control for the host only; guests already have the app's
        // dedicated Leave meeting button.
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: ["microphone", "camera", "desktop", "fullscreen", ...(video.moderator === true ? ["hangup"] : []), "chat", "raisehand", "tileview"],
        },
      });
      apiRef.current.addEventListener("videoConferenceJoined", onJoined || (() => {}));
      apiRef.current.addEventListener("videoConferenceLeft", onLeft || (() => {}));
    }).catch((loadError) => { if (!disposed) setError(loadError.message); });
    return () => { disposed = true; apiRef.current?.dispose?.(); apiRef.current = null; };
  }, [video, onJoined, onLeft]);

  if (error) {
    const setupHint = video?.enabled
      ? "Check that the meeting server is reachable, then reload the room."
      : video?.reason || "Video is not configured for this environment.";
    const localCertificateUrl = video?.domain === "localhost:8443" ? `https://${video.domain}` : "";
    return <div className="flex min-h-[60vh] items-center justify-center p-6 text-center text-white"><div><p>{error}</p><p className="mt-2 text-sm text-white/60">{setupHint}</p>{localCertificateUrl && <><p className="mt-4 max-w-md text-sm text-white/70">This local meeting server uses a development certificate. Open it once, accept the browser warning, then reload this room.</p><a href={localCertificateUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20">Open local meeting server</a></>}</div></div>;
  }
  return <div ref={containerRef} className={`h-screen w-full ${className}`} aria-label={meetingTitle || "Private meeting"} />;
}
