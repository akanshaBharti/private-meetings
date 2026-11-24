import datetime

import jwt
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Meeting, MeetingParticipant
from .services import join_participant
from .video_provider import build_jitsi_payload


User = get_user_model()


@override_settings(
    JITSI_APP_SECRET="test-jitsi-secret",
    JITSI_DOMAIN="meet.example.test",
    JITSI_JWT_SUB="meet.example.test",
    JITSI_ALLOW_PUBLIC_DEV=False,
    JITSI_ALLOW_UNSECURED_DEV=False,
)
class MeetingPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.host = User.objects.create_user(username="host@example.com", email="host@example.com", password="Safe-pass-123")
        self.participant = User.objects.create_user(username="participant@example.com", email="participant@example.com", password="Safe-pass-123")
        self.outsider = User.objects.create_user(username="outsider@example.com", email="outsider@example.com", password="Safe-pass-123")
        self.meeting = Meeting.objects.create(
            title="Permission test",
            scheduled_date=datetime.date.today(),
            start_time=(timezone.localtime() + datetime.timedelta(hours=1)).time().replace(second=0, microsecond=0),
            host=self.host,
            meeting_code="permission1",
        )
        MeetingParticipant.objects.create(
            meeting=self.meeting,
            user=self.host,
            role=MeetingParticipant.Role.HOST,
            join_status=MeetingParticipant.JoinStatus.INVITED,
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_registered_invitee_is_visible_and_outsider_knocks(self):
        MeetingParticipant.objects.create(meeting=self.meeting, user=self.participant)

        self.authenticate(self.participant)
        response = self.client.get("/api/meetings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["id"], str(self.meeting.id))

        self.authenticate(self.outsider)
        response = self.client.post(f"/api/meetings/{self.meeting.id}/join/")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data["viewer_join_status"], MeetingParticipant.JoinStatus.KNOCKING)

    def test_only_host_can_admit_and_end_for_everyone(self):
        pending = MeetingParticipant.objects.create(
            meeting=self.meeting,
            user=self.participant,
            join_status=MeetingParticipant.JoinStatus.KNOCKING,
        )

        self.authenticate(self.participant)
        response = self.client.post(f"/api/meetings/{self.meeting.id}/admit/", {"request_id": pending.id, "approve": True})
        self.assertEqual(response.status_code, 403)

        self.authenticate(self.host)
        response = self.client.post(f"/api/meetings/{self.meeting.id}/admit/", {"request_id": pending.id, "approve": True})
        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.join_status, MeetingParticipant.JoinStatus.INVITED)

        host_participant = self.meeting.participants.get(user=self.host)
        join_participant(host_participant)
        join_participant(pending)
        self.authenticate(self.participant)
        response = self.client.post(f"/api/meetings/{self.meeting.id}/end/")
        self.assertEqual(response.status_code, 200)
        self.meeting.refresh_from_db()
        self.assertEqual(self.meeting.status, Meeting.Status.LIVE)

    def test_public_guest_waits_then_joins_after_host_approval(self):
        response = self.client.post(
            f"/api/public/{self.meeting.meeting_code}/join/",
            {"name": "Guest User", "email": "guest@example.com"},
        )
        self.assertEqual(response.status_code, 202)
        token = response.data["guest_session_token"]
        guest = MeetingParticipant.objects.get(meeting=self.meeting, guest_email="guest@example.com")
        self.assertEqual(guest.join_status, MeetingParticipant.JoinStatus.KNOCKING)

        self.authenticate(self.host)
        response = self.client.post(f"/api/meetings/{self.meeting.id}/admit/", {"request_id": guest.id, "approve": True})
        self.assertEqual(response.status_code, 200)

        response = self.client.get(f"/api/public/{self.meeting.meeting_code}/join-status/?guest_session_token={token}")
        self.assertEqual(response.data["status"], MeetingParticipant.JoinStatus.INVITED)

        response = self.client.post(
            f"/api/public/{self.meeting.meeting_code}/join/",
            {"name": "Guest User", "email": "guest@example.com"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["join_status"], MeetingParticipant.JoinStatus.JOINED)
        self.assertTrue(response.data["video"]["jwt"])

    def test_only_host_jitsi_token_is_moderator(self):
        host_payload = build_jitsi_payload(self.meeting, display_name="Host", email=self.host.email, moderator=True, participant_id=1)
        guest_payload = build_jitsi_payload(self.meeting, display_name="Guest", email="guest@example.com", moderator=False, participant_id=2)
        host_claims = jwt.decode(host_payload["jwt"], options={"verify_signature": False})
        guest_claims = jwt.decode(guest_payload["jwt"], options={"verify_signature": False})
        self.assertTrue(host_claims["context"]["user"]["moderator"])
        self.assertNotIn("moderator", guest_claims["context"]["user"])
