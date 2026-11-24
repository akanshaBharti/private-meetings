import time
import re

from django.conf import settings

try:
    import jwt
except ImportError:  # pragma: no cover - production requirements include simplejwt/PyJWT
    jwt = None


DEFAULT_JITSI_TOKEN_TTL_SECONDS = 3600
MAX_JITSI_TOKEN_TTL_SECONDS = 7200
MIN_JITSI_TOKEN_TTL_SECONDS = 300
DEFAULT_JITSI_TOKEN_CLOCK_SKEW_SECONDS = 300
MAX_JITSI_TOKEN_CLOCK_SKEW_SECONDS = 600


def get_jitsi_token_ttl_seconds():
    configured_ttl = int(
        getattr(settings, "JITSI_TOKEN_TTL_SECONDS", DEFAULT_JITSI_TOKEN_TTL_SECONDS)
        or DEFAULT_JITSI_TOKEN_TTL_SECONDS
    )
    return max(MIN_JITSI_TOKEN_TTL_SECONDS, min(configured_ttl, MAX_JITSI_TOKEN_TTL_SECONDS))


def get_jitsi_token_clock_skew_seconds():
    configured_skew = int(
        getattr(settings, "JITSI_TOKEN_CLOCK_SKEW_SECONDS", DEFAULT_JITSI_TOKEN_CLOCK_SKEW_SECONDS)
        or DEFAULT_JITSI_TOKEN_CLOCK_SKEW_SECONDS
    )
    return max(0, min(configured_skew, MAX_JITSI_TOKEN_CLOCK_SKEW_SECONDS))


def build_room_name(meeting):
    prefix = getattr(settings, "JITSI_ROOM_PREFIX", "pm") or "pm"
    room = f"{prefix}-{meeting.meeting_code}"
    # Standalone recurring occurrences (parent_meeting trees) all inherit the
    # parent's meeting_code, which would otherwise collapse every occurrence into
    # a single Jitsi room. Append the occurrence's own id so each gets its own
    # room. Department MeetingSeries occurrences (series_id) intentionally keep a
    # single shared "standing" room (Google-Meet style), so they are left as-is.
    if getattr(meeting, "parent_meeting_id", None):
        room = f"{room}-{meeting.id}"
    return room


def get_jitsi_config_status():
    provider = getattr(settings, "JITSI_PROVIDER", "self_hosted") or "self_hosted"
    domain = (getattr(settings, "JITSI_DOMAIN", "meet.jit.si") or "meet.jit.si").strip().lower()
    enabled = bool(getattr(settings, "MEETINGS_VIDEO_ENABLED", True))
    app_secret = getattr(settings, "JITSI_APP_SECRET", "") or ""
    allow_unsecured = bool(getattr(settings, "JITSI_ALLOW_UNSECURED_DEV", False))
    debug = bool(getattr(settings, "DEBUG", False))
    allow_public_dev = bool(getattr(settings, "JITSI_ALLOW_PUBLIC_DEV", False)) and debug
    failures = []

    if enabled:
        if provider != "self_hosted":
            failures.append("provider_must_be_self_hosted")
        if not re.match(r"^[a-z0-9.-]+(?::[0-9]+)?$", domain):
            failures.append("invalid_jitsi_domain")
        if domain == "meet.jit.si" and not allow_public_dev:
            failures.append("public_jitsi_domain_not_allowed")
        if not app_secret and not (allow_unsecured and debug):
            failures.append("jitsi_jwt_secret_missing")
        if allow_unsecured and not debug:
            failures.append("unsecured_dev_only_allowed_with_debug")
        if app_secret and jwt is None:
            failures.append("jwt_library_missing")

    return {
        "enabled": enabled,
        "provider": provider,
        "domain": domain,
        "uses_public_jitsi": domain == "meet.jit.si",
        "jwt_configured": bool(app_secret),
        "room_prefix": getattr(settings, "JITSI_ROOM_PREFIX", "pm") or "pm",
        "token_ttl_seconds": get_jitsi_token_ttl_seconds(),
        "token_clock_skew_seconds": get_jitsi_token_clock_skew_seconds(),
        "script_url": f"https://{domain}/external_api.js" if domain else "",
        "allow_unsecured_dev": allow_unsecured and debug,
        "ready": enabled and not failures,
        "failures": failures,
    }


def build_jitsi_payload(meeting, *, display_name, email="", moderator=False, participant_id=None):
    provider = getattr(settings, "JITSI_PROVIDER", "self_hosted") or "self_hosted"
    domain = (getattr(settings, "JITSI_DOMAIN", "meet.jit.si") or "meet.jit.si").strip().lower()
    room_name = build_room_name(meeting)

    payload = {
        "enabled": bool(getattr(settings, "MEETINGS_VIDEO_ENABLED", True)),
        "provider": provider,
        "domain": domain,
        "roomName": room_name,
        "displayName": display_name or "Guest",
        "email": email or "",
        "moderator": bool(moderator),
        "jwt": None,
        "participantId": str(participant_id) if participant_id else None,
    }
    participant_context_id = payload["participantId"] or (email or "").strip().lower()

    if not payload["enabled"]:
        payload["reason"] = "Meetings video is disabled for this environment."
        return payload

    if provider != "self_hosted":
        payload["enabled"] = False
        payload["reason"] = "Meetings video must use the self-hosted Jitsi provider."
        return payload

    if not re.match(r"^[a-z0-9.-]+(?::[0-9]+)?$", domain):
        payload["enabled"] = False
        payload["reason"] = "Jitsi domain is not valid."
        return payload

    allow_public_dev = bool(getattr(settings, "JITSI_ALLOW_PUBLIC_DEV", False)) and bool(getattr(settings, "DEBUG", False))
    if domain == "meet.jit.si" and not allow_public_dev:
        payload["enabled"] = False
        payload["reason"] = "Public meet.jit.si is not allowed for Private Meetings meetings."
        return payload

    app_id = getattr(settings, "JITSI_APP_ID", "private_meetings") or "private_meetings"
    app_secret = getattr(settings, "JITSI_APP_SECRET", "") or ""
    allow_unsecured = bool(getattr(settings, "JITSI_ALLOW_UNSECURED_DEV", False))

    if not app_secret:
        if allow_unsecured and getattr(settings, "DEBUG", False):
            payload["unsecured"] = True
            payload["reason"] = "Unsecured development mode is enabled."
            return payload
        payload["enabled"] = False
        payload["reason"] = "Jitsi JWT secret is not configured."
        return payload

    if jwt is None:
        payload["enabled"] = False
        payload["reason"] = "JWT library is not installed."
        return payload

    now = int(time.time())
    ttl = get_jitsi_token_ttl_seconds()
    clock_skew = get_jitsi_token_clock_skew_seconds()
    sub = getattr(settings, "JITSI_JWT_SUB", domain) or domain
    token_user = {
        "id": participant_context_id,
        "name": payload["displayName"],
        "email": payload["email"],
    }
    if moderator:
        token_user.update({"moderator": True, "affiliation": "owner"})

    token_payload = {
        "aud": app_id,
        "iss": app_id,
        "sub": sub,
        "room": room_name,
        "iat": now - clock_skew,
        "nbf": now - clock_skew,
        "exp": now + ttl,
        "context": {
            "user": token_user,
        },
    }
    payload["jwt"] = jwt.encode(token_payload, app_secret, algorithm="HS256")
    return payload
