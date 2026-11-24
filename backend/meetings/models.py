import base64
import hashlib
import secrets
import string

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models

def _meeting_pin_cipher():
    secret = getattr(settings, "MEETING_PIN_ENCRYPTION_KEY", "") or settings.SECRET_KEY
    key = base64.urlsafe_b64encode(hashlib.sha256(str(secret).encode("utf-8")).digest())
    return Fernet(key)


def _encrypt_meeting_pin(raw_pin):
    if not raw_pin:
        return ""
    return _meeting_pin_cipher().encrypt(str(raw_pin).encode("utf-8")).decode("ascii")


def _decrypt_meeting_pin(ciphertext):
    if not ciphertext:
        return ""
    try:
        return _meeting_pin_cipher().decrypt(str(ciphertext).encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError, TypeError):
        return ""


def _generate_meeting_code():
    chars = string.ascii_lowercase + string.digits
    while True:
        code = "".join(secrets.choice(chars) for _ in range(10))
        if not Meeting.objects.filter(meeting_code=code).exists() and not MeetingSeries.objects.filter(meeting_code=code).exists():
            return code


class Meeting(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        LIVE = "live", "Live"
        ENDED = "ended", "Ended"
        CANCELLED = "cancelled", "Cancelled"

    class MeetingType(models.TextChoices):
        INSTANT = "instant", "Instant"
        SCHEDULED = "scheduled", "Scheduled"
        RECURRING = "recurring", "Recurring"

    class AccessType(models.TextChoices):
        OPEN = "open", "Open"
        TRUSTED = "trusted", "Trusted"

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    meeting_type = models.CharField(max_length=20, choices=MeetingType.choices, default=MeetingType.SCHEDULED)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    scheduled_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.CharField(max_length=100, blank=True, default="")
    series = models.ForeignKey("MeetingSeries", null=True, blank=True, on_delete=models.SET_NULL, related_name="occurrences")
    parent_meeting = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="occurrences")
    meeting_code = models.CharField(max_length=12, default=_generate_meeting_code)
    external_join_pin_hash = models.CharField(max_length=128, blank=True, default="")
    external_join_pin_ciphertext = models.CharField(max_length=255, blank=True, default="")
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hosted_meetings")
    access_type = models.CharField(max_length=20, choices=AccessType.choices, default=AccessType.TRUSTED)
    participant_permissions = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    actual_start_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["scheduled_date", "start_time"]
        indexes = [
            models.Index(fields=["host", "scheduled_date"], name="meetings_me_host_date_idx"),
            models.Index(fields=["host", "status"], name="meetings_me_host_status_idx"),
            models.Index(fields=["meeting_code"], name="meetings_me_meeting_code_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["series", "scheduled_date"],
                condition=models.Q(is_active=True, series__isnull=False),
                name="uniq_active_meeting_series_date",
            ),
        ]

    def __str__(self):
        return f"{self.title} ({self.scheduled_date})"

    @property
    def external_pin_required(self):
        return bool(self.external_join_pin_hash)

    def set_external_join_pin(self, raw_pin):
        self.external_join_pin_hash = make_password(str(raw_pin))
        self.external_join_pin_ciphertext = _encrypt_meeting_pin(raw_pin)

    def get_external_join_pin(self):
        return _decrypt_meeting_pin(self.external_join_pin_ciphertext)

    def check_external_join_pin(self, raw_pin):
        return bool(self.external_join_pin_hash and raw_pin and check_password(str(raw_pin), self.external_join_pin_hash))


class MeetingSeries(models.Model):
    class RecurrenceFrequency(models.TextChoices):
        DAILY = "daily", "Daily"

    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hosted_meeting_series")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    meeting_code = models.CharField(max_length=12, default=_generate_meeting_code, db_index=True)
    external_join_pin_hash = models.CharField(max_length=128, blank=True, default="")
    external_join_pin_ciphertext = models.CharField(max_length=255, blank=True, default="")
    recurrence_frequency = models.CharField(max_length=20, choices=RecurrenceFrequency.choices, default=RecurrenceFrequency.DAILY)
    recurrence_rule = models.CharField(max_length=120, blank=True, default="FREQ=DAILY")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    start_time = models.TimeField()
    duration_minutes = models.PositiveIntegerField(default=30)
    working_days = models.JSONField(default=list, blank=True)
    reminder_minutes_before = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_time", "title"]

    def __str__(self):
        return self.title

    @property
    def external_pin_required(self):
        return bool(self.external_join_pin_hash)

    def set_external_join_pin(self, raw_pin):
        self.external_join_pin_hash = make_password(str(raw_pin))
        self.external_join_pin_ciphertext = _encrypt_meeting_pin(raw_pin)

    def get_external_join_pin(self):
        return _decrypt_meeting_pin(self.external_join_pin_ciphertext)

    def check_external_join_pin(self, raw_pin):
        return bool(self.external_join_pin_hash and raw_pin and check_password(str(raw_pin), self.external_join_pin_hash))


class MeetingParticipant(models.Model):
    class Role(models.TextChoices):
        HOST = "host", "Host"
        PARTICIPANT = "participant", "Participant"
        GUEST = "guest", "Guest (External)"

    class JoinStatus(models.TextChoices):
        INVITED = "invited", "Invited"
        JOINED = "joined", "Joined"
        LEFT = "left", "Left"
        KNOCKING = "knocking", "Knocking"

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="meeting_participations")
    guest_name = models.CharField(max_length=100, blank=True, default="")
    guest_email = models.EmailField(blank=True, default="")
    guest_session_token = models.CharField(max_length=96, blank=True, default="", db_index=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.PARTICIPANT)
    join_status = models.CharField(max_length=20, choices=JoinStatus.choices, default=JoinStatus.INVITED)
    joined_at = models.DateTimeField(null=True, blank=True)
    left_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["meeting", "join_status", "last_seen_at"], name="meeting_part_seen_idx")]

    def __str__(self):
        name = self.user.get_full_name() if self.user else self.guest_name
        return f"{name or self.guest_email} → {self.meeting.title}"


class MeetingParticipantSession(models.Model):
    participant = models.ForeignKey(MeetingParticipant, on_delete=models.CASCADE, related_name="attendance_sessions")
    joined_at = models.DateTimeField()
    left_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["participant"],
                condition=models.Q(left_at__isnull=True),
                name="uniq_open_meeting_part_session",
            ),
        ]
