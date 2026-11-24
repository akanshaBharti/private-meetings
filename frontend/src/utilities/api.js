const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const API_ENDPOINTS = {
  HEALTH: {
    VIDEO: `${BASE_URL}/api/health/video/`,
  },
  AUTH: {
    SIGNUP: `${BASE_URL}/api/auth/signup/`,
    LOGIN: `${BASE_URL}/api/auth/login/`,
    GET_SESSION: `${BASE_URL}/api/auth/session/`,
    LOGOUT: `${BASE_URL}/api/auth/logout/`,
  },
  MEETINGS: {
    GET_LIST: `${BASE_URL}/api/meetings/`,
    GET_COUNTS: `${BASE_URL}/api/meetings/counts/`,
    GET_UPCOMING: `${BASE_URL}/api/meetings/upcoming/`,
    POST_CREATE: `${BASE_URL}/api/meetings/`,
    GET_SERIES: `${BASE_URL}/api/meetings/series/`,
    POST_SERIES: `${BASE_URL}/api/meetings/series/`,
    POST_INSTANT: `${BASE_URL}/api/meetings/instant/`,
    GET_DETAIL: `${BASE_URL}/api/meetings/:meeting_id/`,
    PATCH_UPDATE: `${BASE_URL}/api/meetings/:meeting_id/`,
    DELETE: `${BASE_URL}/api/meetings/:meeting_id/`,
    POST_JOIN: `${BASE_URL}/api/meetings/:meeting_id/join/`,
    POST_LEAVE: `${BASE_URL}/api/meetings/:meeting_id/leave/`,
    POST_HEARTBEAT: `${BASE_URL}/api/meetings/:meeting_id/heartbeat/`,
    POST_END: `${BASE_URL}/api/meetings/:meeting_id/end/`,
    POST_ADMIT: `${BASE_URL}/api/meetings/:meeting_id/admit/`,
    POST_ADD_PARTICIPANTS: `${BASE_URL}/api/meetings/:meeting_id/participants/`,
  },
  PUBLIC_MEETINGS: {
    LOOKUP: `${BASE_URL}/api/public/:meeting_code/`,
    JOIN: `${BASE_URL}/api/public/:meeting_code/join/`,
    LEAVE: `${BASE_URL}/api/public/:meeting_code/leave/`,
    HEARTBEAT: `${BASE_URL}/api/public/:meeting_code/heartbeat/`,
    JOIN_STATUS: `${BASE_URL}/api/public/:meeting_code/join-status/`,
  },
};

export { BASE_URL };
