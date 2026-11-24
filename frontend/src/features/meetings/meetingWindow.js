export function isMeetingTab() {
  return new URLSearchParams(window.location.search).get("meeting_tab") === "1";
}

export function closeMeetingTab(fallback) {
  if (!isMeetingTab()) {
    fallback();
    return;
  }

  window.close();
  window.setTimeout(() => {
    if (!window.closed) fallback();
  }, 150);
}
