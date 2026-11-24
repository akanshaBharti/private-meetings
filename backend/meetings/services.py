import datetime
import logging
import secrets

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models.functions import Lower
from django.utils import timezone

from .models import Meeting, MeetingParticipant, MeetingParticipantSession, MeetingSeries
from .recurrence import expand_occurrences


logger = logging.getLogger("meetings.services")
User = get_user_model()


def meeting_heartbeat_timeout_delta():
    from django.conf import settings

    return datetime.timedelta(seconds=int(getattr(settings, "MEETINGS_LIVE_HEARTBEAT_TIMEOUT_SECONDS", 90)))


def meeting_scheduled_expiry_grace_delta():
    from django.conf import settings

    return datetime.timedelta(seconds=int(getattr(settings, "MEETINGS_SCHEDULED_EXPIRY_GRACE_SECONDS", 900)))


def meeting_scheduled_expires_at(meeting):
    start = datetime.datetime.combine(meeting.scheduled_date, meeting.start_time)
    return timezone.make_aware(start) + datetime.timedelta(minutes=meeting.duration_minutes) + meeting_scheduled_expiry_grace_delta()


def live_participant_queryset(meeting, *, now=None):
    now = now or timezone.now()
    return meeting.participants.filter(is_active=True, last_seen_at__gte=now - meeting_heartbeat_timeout_delta())


def mark_participant_seen(participant, *, now=None):
    now = now or timezone.now()
    participant.last_seen_at = now
    participant.save(update_fields=["last_seen_at"])
    MeetingParticipantSession.objects.filter(participant=participant, left_at__isnull=True).update(last_seen_at=now)


def ensure_internal_participant(meeting, *, user, role=MeetingParticipant.Role.PARTICIPANT, join_status=None):
    if not user:
        raise ValueError("user is required")
    participant, _ = MeetingParticipant.objects.get_or_create(
        meeting=meeting,
        user=user,
        defaults={"role": role, "join_status": join_status or MeetingParticipant.JoinStatus.INVITED},
    )
    updates = []
    if participant.role != role and role == MeetingParticipant.Role.HOST:
        participant.role = role
        updates.append("role")
    if join_status and participant.join_status != join_status:
        participant.join_status = join_status
        updates.append("join_status")
    if updates:
        participant.save(update_fields=updates)
    return participant


def ensure_guest_invite_participant(meeting, *, guest_name="", guest_email="", session_token="", join_status=None):
    guest_email = (guest_email or "").strip().lower()
    participant = meeting.participants.filter(guest_email__iexact=guest_email, is_active=True).first()
    if participant is None:
        participant = MeetingParticipant.objects.create(
            meeting=meeting,
            guest_name=guest_name or guest_email.split("@", 1)[0],
            guest_email=guest_email,
            guest_session_token=session_token or secrets.token_urlsafe(48),
            role=MeetingParticipant.Role.GUEST,
            join_status=join_status or MeetingParticipant.JoinStatus.INVITED,
        )
    elif session_token and participant.guest_session_token != session_token:
        participant.guest_session_token = session_token
        participant.save(update_fields=["guest_session_token"])
    return participant


def ensure_email_invitees(meeting, emails, *, exclude_user=None):
    """Invite registered users by email and keep unknown addresses as guests."""
    normalized_emails = sorted({str(email).strip().lower() for email in emails if str(email).strip()})
    if not normalized_emails:
        return

    registered_users = User.objects.annotate(normalized_email=Lower("email")).filter(
        is_active=True,
        normalized_email__in=normalized_emails,
    )
    users_by_email = {user.email.lower(): user for user in registered_users if user.email}

    for email in normalized_emails:
        user = users_by_email.get(email)
        if user:
            if exclude_user and user.id == exclude_user.id:
                continue
            ensure_internal_participant(meeting, user=user)
        else:
            ensure_guest_invite_participant(meeting, guest_email=email)


def meeting_counts(meeting, *, now=None):
    participants = meeting.participants.filter(is_active=True)
    return {
        "participants": participants.count(),
        "live_participants": live_participant_queryset(meeting, now=now).count(),
        "pending_requests": participants.filter(join_status=MeetingParticipant.JoinStatus.KNOCKING).count(),
    }


def end_stale_live_meetings(queryset=None, *, now=None):
    now = now or timezone.now()
    queryset = queryset or Meeting.objects.filter(is_active=True, status=Meeting.Status.LIVE)
    ended = []
    for meeting in queryset:
        if meeting.actual_start_time and not live_participant_queryset(meeting, now=now).exists():
            meeting.status = Meeting.Status.ENDED
            meeting.actual_end_time = now
            meeting.save(update_fields=["status", "actual_end_time", "updated_at"])
            ended.append(meeting)
    return ended


def end_expired_scheduled_meetings(queryset=None, *, now=None):
    now = now or timezone.now()
    queryset = queryset or Meeting.objects.filter(is_active=True, status=Meeting.Status.SCHEDULED)
    ended = []
    for meeting in queryset:
        if timezone.now() > meeting_scheduled_expires_at(meeting):
            meeting.status = Meeting.Status.ENDED
            meeting.actual_end_time = now
            meeting.save(update_fields=["status", "actual_end_time", "updated_at"])
            ended.append(meeting)
    return ended


def generate_rrule_occurrences(parent, *, max_count=None, horizon_days=None, seed_date=None):
    if not parent.is_recurring or not parent.recurrence_rule:
        return []
    dates = expand_occurrences(
        parent.recurrence_rule,
        seed_date or parent.scheduled_date,
        max_count=max_count or 12,
        horizon_days=horizon_days or 800,
    )
    created = []
    for date_value in dates:
        meeting, _ = Meeting.objects.get_or_create(
            parent_meeting=parent,
            scheduled_date=date_value,
            defaults={
                "title": parent.title,
                "description": parent.description,
                "meeting_type": parent.meeting_type,
                "status": Meeting.Status.SCHEDULED,
                "start_time": parent.start_time,
                "end_time": parent.end_time,
                "duration_minutes": parent.duration_minutes,
                "is_recurring": True,
                "recurrence_rule": parent.recurrence_rule,
                "host": parent.host,
                "access_type": parent.access_type,
            },
        )
        for invited in parent.participants.exclude(role=MeetingParticipant.Role.HOST).filter(is_active=True):
            if invited.user_id:
                ensure_internal_participant(meeting, user=invited.user, role=invited.role)
            elif invited.guest_email:
                ensure_guest_invite_participant(meeting, guest_name=invited.guest_name, guest_email=invited.guest_email)
        created.append(meeting)
    return created


def create_or_sync_series_occurrence(series, occurrence_date, *, notify_new=False):
    meeting, _ = Meeting.objects.get_or_create(
        series=series,
        scheduled_date=occurrence_date,
        defaults={
            "title": series.title,
            "description": series.description,
            "meeting_type": Meeting.MeetingType.RECURRING,
            "status": Meeting.Status.SCHEDULED,
            "start_time": series.start_time,
            "duration_minutes": series.duration_minutes,
            "is_recurring": True,
            "recurrence_rule": series.recurrence_rule,
            "host": series.host,
        },
    )
    ensure_internal_participant(meeting, user=series.host, role=MeetingParticipant.Role.HOST)
    return meeting


def generate_series_occurrences(*, today=None, days_ahead=30, notify_new=False, host=None):
    today = today or timezone.localdate()
    created = []
    series_queryset = MeetingSeries.objects.filter(is_active=True)
    if host is not None:
        series_queryset = series_queryset.filter(host=host)
    for series in series_queryset:
        end = today + datetime.timedelta(days=days_ahead)
        current = max(series.start_date, today)
        while current <= end and (not series.end_date or current <= series.end_date):
            created.append(create_or_sync_series_occurrence(series, current, notify_new=notify_new))
            current += datetime.timedelta(days=1)
    return created


@transaction.atomic
def join_participant(participant, *, now=None):
    now = now or timezone.now()
    participant.join_status = MeetingParticipant.JoinStatus.JOINED
    participant.joined_at = participant.joined_at or now
    participant.left_at = None
    participant.last_seen_at = now
    participant.is_active = True
    participant.save(update_fields=["join_status", "joined_at", "left_at", "last_seen_at", "is_active"])
    MeetingParticipantSession.objects.filter(participant=participant, left_at__isnull=True).update(left_at=now, last_seen_at=now)
    MeetingParticipantSession.objects.create(participant=participant, joined_at=now, last_seen_at=now)
    meeting = participant.meeting
    if meeting.status == Meeting.Status.SCHEDULED:
        meeting.status = Meeting.Status.LIVE
        meeting.actual_start_time = now
        meeting.save(update_fields=["status", "actual_start_time", "updated_at"])
    return participant


@transaction.atomic
def leave_participant(participant, *, now=None, end_for_all=False):
    now = now or timezone.now()
    participant.join_status = MeetingParticipant.JoinStatus.LEFT
    participant.left_at = now
    participant.last_seen_at = now
    participant.save(update_fields=["join_status", "left_at", "last_seen_at"])
    MeetingParticipantSession.objects.filter(participant=participant, left_at__isnull=True).update(left_at=now, last_seen_at=now)
    meeting = participant.meeting
    if end_for_all or not live_participant_queryset(meeting, now=now).exclude(id=participant.id).exists():
        meeting.status = Meeting.Status.ENDED
        meeting.actual_end_time = now
        meeting.save(update_fields=["status", "actual_end_time", "updated_at"])
    return participant
