export function getMeetingJoinUrl(meetingCode) {
  return new URL(`/join/${meetingCode}`, window.location.origin).toString();
}

export async function copyMeetingLink(meetingCode) {
  const value = getMeetingJoinUrl(meetingCode);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return value;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("Clipboard is unavailable");
  return value;
}
