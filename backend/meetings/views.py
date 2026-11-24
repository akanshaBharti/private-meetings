import secrets
from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Meeting, MeetingParticipant, MeetingParticipantSession, MeetingSeries
from .serializers import (
    AddParticipantsSerializer,
    GuestJoinSerializer,
    GuestPinVerifySerializer,
    MeetingCreateSerializer,
    MeetingListSerializer,
    MeetingPublicSerializer,
    MeetingReadSerializer,
    MeetingSeriesCreateSerializer,
    MeetingSeriesReadSerializer,
    MeetingUpdateSerializer,
    ParticipantReadSerializer,
)
from .services import (
    end_expired_scheduled_meetings,
    end_stale_live_meetings,
    ensure_guest_invite_participant,
    ensure_email_invitees,
    ensure_internal_participant,
    generate_rrule_occurrences,
    generate_series_occurrences,
    join_participant,
    leave_participant,
    mark_participant_seen,
    meeting_counts,
)
from .video_provider import build_jitsi_payload, get_jitsi_config_status


User = get_user_model()


def _user_display_name(user):
    return user.get_full_name() or user.email or user.username


def _meeting_id(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _can_access(meeting, user):
    if meeting.host_id == user.id:
        return True
    return meeting.participants.filter(user=user, is_active=True).exists()


def _serialize_meeting(meeting, request, *, participant=None):
    data = MeetingReadSerializer(meeting, context={"request": request}).data
    viewer = participant or meeting.participants.filter(user=request.user).first()
    data["viewer_join_status"] = viewer.join_status if viewer else None
    data["viewer_is_host"] = meeting.host_id == request.user.id
    data["video"] = build_jitsi_payload(
        meeting,
        display_name=_user_display_name(request.user),
        email=request.user.email,
        moderator=meeting.host_id == request.user.id,
        participant_id=participant.id if participant else None,
    )
    data["counts"] = meeting_counts(meeting)
    return data


def _list_queryset(request):
    # Series are stored separately from their visible meeting occurrences.
    # Sync them before every meeting read so newly-created and older series
    # both appear in Scheduled Meetings without requiring a background worker.
    generate_series_occurrences(host=request.user)
    end_stale_live_meetings(Meeting.objects.filter(host=request.user, status=Meeting.Status.LIVE))
    end_expired_scheduled_meetings(Meeting.objects.filter(host=request.user, status=Meeting.Status.SCHEDULED))
    queryset = Meeting.objects.filter(
        Q(is_active=True) | Q(status=Meeting.Status.CANCELLED),
    ).select_related("host").prefetch_related("participants", "participants__user")
    queryset = queryset.filter(Q(host=request.user) | Q(participants__user=request.user)).distinct()
    status_filter = [value.strip() for value in request.query_params.get("status", "").split(",") if value.strip()]
    if status_filter:
        queryset = queryset.filter(status__in=status_filter)
    if request.query_params.get("type"):
        queryset = queryset.filter(meeting_type=request.query_params["type"])
    if request.query_params.get("date_from"):
        queryset = queryset.filter(scheduled_date__gte=request.query_params["date_from"])
    if request.query_params.get("date_to"):
        queryset = queryset.filter(scheduled_date__lte=request.query_params["date_to"])
    if request.query_params.get("search"):
        search = request.query_params["search"]
        queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search) | Q(participants__guest_name__icontains=search) | Q(participants__guest_email__icontains=search)).distinct()
    return queryset


class MeetingVideoHealthAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        payload = get_jitsi_config_status()
        return Response(payload, status=status.HTTP_200_OK if payload["ready"] else status.HTTP_503_SERVICE_UNAVAILABLE)


class MeetingListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = _list_queryset(request)
        if request.query_params.get("recurring") == "true":
            queryset = queryset.filter(is_recurring=True)
        page_size = min(int(request.query_params.get("page_size", 50) or 50), 200)
        meetings = list(queryset.order_by("scheduled_date", "start_time")[:page_size])
        today = timezone.localdate()
        data = MeetingListSerializer(meetings, many=True, context={"request": request}).data
        return Response({"count": queryset.count(), "results": data, "tab_counts": {
            "upcoming": queryset.filter(status__in=[Meeting.Status.SCHEDULED, Meeting.Status.LIVE], scheduled_date__gte=today).count(),
            "past": queryset.filter(status__in=[Meeting.Status.ENDED, Meeting.Status.CANCELLED]).count(),
            "recurring": queryset.filter(is_recurring=True).count(),
        }})

    def post(self, request):
        serializer = MeetingCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        meeting = serializer.save()
        generate_rrule_occurrences(meeting)
        return Response(_serialize_meeting(meeting, request), status=status.HTTP_201_CREATED)


class MeetingCountsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = _list_queryset(request)
        return Response({
            "upcoming": queryset.filter(status__in=[Meeting.Status.SCHEDULED, Meeting.Status.LIVE], scheduled_date__gte=timezone.localdate()).count(),
            "past": queryset.filter(status__in=[Meeting.Status.ENDED, Meeting.Status.CANCELLED]).count(),
            "recurring": queryset.filter(is_recurring=True).count(),
        })


class MeetingUpcomingAPIView(MeetingListCreateAPIView):
    def get(self, request):
        request.query_params._mutable = True
        request.query_params["status"] = f"{Meeting.Status.SCHEDULED},{Meeting.Status.LIVE}"
        return super().get(request)


class MeetingInstantAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = request.data.copy()
        payload.update({"meeting_type": Meeting.MeetingType.INSTANT, "scheduled_date": timezone.localdate(), "start_time": timezone.localtime().time().replace(second=0, microsecond=0)})
        serializer = MeetingCreateSerializer(data=payload, context={"request": request})
        serializer.is_valid(raise_exception=True)
        meeting = serializer.save()
        participant = ensure_internal_participant(meeting, user=request.user, role=MeetingParticipant.Role.HOST)
        join_participant(participant)
        return Response(_serialize_meeting(meeting, request, participant=participant), status=status.HTTP_201_CREATED)


class MeetingDetailAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, request, meeting_id):
        pk = _meeting_id(meeting_id)
        meeting = Meeting.objects.select_related("host").prefetch_related("participants", "participants__user").filter(pk=pk, is_active=True).first()
        if not meeting or not _can_access(meeting, request.user):
            return None
        return meeting

    def get(self, request, meeting_id):
        meeting = self.get_object(request, meeting_id)
        if not meeting:
            return Response({"detail": "Meeting not found."}, status=404)
        return Response(_serialize_meeting(meeting, request))

    def patch(self, request, meeting_id):
        meeting = self.get_object(request, meeting_id)
        if not meeting or meeting.host_id != request.user.id:
            return Response({"detail": "Only the host can update this meeting."}, status=403)
        serializer = MeetingUpdateSerializer(instance=meeting, data=request.data)
        serializer.is_valid(raise_exception=True)
        return Response(_serialize_meeting(serializer.save(), request))

    def delete(self, request, meeting_id):
        meeting = self.get_object(request, meeting_id)
        if not meeting or meeting.host_id != request.user.id:
            return Response({"detail": "Only the host can cancel this meeting."}, status=403)
        meeting.status = Meeting.Status.CANCELLED
        meeting.is_active = False
        meeting.save(update_fields=["status", "is_active", "updated_at"])
        return Response(status=204)


class MeetingJoinAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, meeting_id):
        meeting = Meeting.objects.filter(id=_meeting_id(meeting_id), is_active=True).select_related("host").prefetch_related("participants", "participants__user").first()
        if not meeting:
            return Response({"detail": "Meeting not found."}, status=404)
        if meeting.status in {Meeting.Status.ENDED, Meeting.Status.CANCELLED}:
            return Response({"detail": "This meeting has ended."}, status=410)
        participant = meeting.participants.filter(user=request.user).first()
        if participant is None:
            participant = ensure_internal_participant(
                meeting,
                user=request.user,
                role=MeetingParticipant.Role.PARTICIPANT,
                join_status=MeetingParticipant.JoinStatus.KNOCKING,
            )
        if not participant.is_active:
            return Response({"detail": "Your request to join this meeting was denied."}, status=403)
        if participant.join_status == MeetingParticipant.JoinStatus.KNOCKING:
            meeting.participants._remove_prefetched_objects()
            return Response(_serialize_meeting(meeting, request, participant=participant), status=202)
        join_participant(participant)
        meeting.participants._remove_prefetched_objects()
        return Response(_serialize_meeting(meeting, request, participant=participant))


class MeetingLeaveAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, meeting_id):
        meeting = MeetingDetailAPIView().get_object(request, meeting_id)
        if not meeting:
            return Response({"detail": "Meeting not found."}, status=404)
        participant = meeting.participants.filter(user=request.user, is_active=True).first()
        if not participant:
            return Response({"detail": "You are not a participant."}, status=403)
        leave_participant(participant, end_for_all=bool(request.data.get("end_for_all")) and meeting.host_id == request.user.id)
        return Response({"detail": "Left meeting."})


class MeetingHeartbeatAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, meeting_id):
        meeting = MeetingDetailAPIView().get_object(request, meeting_id)
        participant = meeting.participants.filter(user=request.user, is_active=True).first() if meeting else None
        if not participant:
            return Response({"detail": "Meeting not found."}, status=404)
        mark_participant_seen(participant)
        return Response({"ok": True, "status": meeting.status, "counts": meeting_counts(meeting)})


class MeetingEndAPIView(MeetingLeaveAPIView):
    def post(self, request, meeting_id):
        request.data["end_for_all"] = True
        return super().post(request, meeting_id)


class MeetingAddParticipantsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, meeting_id):
        meeting = MeetingDetailAPIView().get_object(request, meeting_id)
        if not meeting or meeting.host_id != request.user.id:
            return Response({"detail": "Only the host can invite participants."}, status=403)
        serializer = AddParticipantsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        users = User.objects.filter(id__in=serializer.validated_data["participants"], is_active=True).exclude(id=meeting.host_id)
        for user in users:
            ensure_internal_participant(meeting, user=user)
        ensure_email_invitees(meeting, serializer.validated_data["guest_emails"], exclude_user=request.user)
        meeting.participants._remove_prefetched_objects()
        return Response(_serialize_meeting(meeting, request))


class MeetingSeriesListCreateAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        series = MeetingSeries.objects.filter(host=request.user)
        return Response(MeetingSeriesReadSerializer(series, many=True).data)

    def post(self, request):
        serializer = MeetingSeriesCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        series = serializer.save()
        generate_series_occurrences(host=request.user)
        return Response(MeetingSeriesReadSerializer(series).data, status=201)


class MeetingPublicLookupAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, meeting_code):
        meeting = Meeting.objects.select_related("host").prefetch_related("participants", "participants__user").filter(meeting_code=meeting_code, is_active=True).first()
        if not meeting:
            return Response({"detail": "Meeting not found."}, status=404)
        return Response(MeetingPublicSerializer(meeting).data)


class MeetingPublicPinVerifyAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, meeting_code):
        meeting = Meeting.objects.filter(meeting_code=meeting_code, is_active=True).first()
        serializer = GuestPinVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not meeting or (meeting.external_pin_required and not meeting.check_external_join_pin(serializer.validated_data["pin"])):
            return Response({"detail": "Invalid meeting PIN."}, status=400)
        return Response({"verified": True})


class MeetingPublicJoinAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, meeting_code):
        meeting = Meeting.objects.filter(meeting_code=meeting_code, is_active=True).first()
        serializer = GuestJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not meeting or (meeting.external_pin_required and not meeting.check_external_join_pin(serializer.validated_data["pin"])):
            return Response({"detail": "Invalid meeting PIN."}, status=400)
        if meeting.status in {Meeting.Status.ENDED, Meeting.Status.CANCELLED}:
            return Response({"detail": "This meeting has ended."}, status=410)
        guest_name = serializer.validated_data["name"]
        guest_email = serializer.validated_data["email"]
        participant = meeting.participants.filter(guest_email__iexact=guest_email, is_active=True).first()
        participant = ensure_guest_invite_participant(
            meeting,
            guest_name=guest_name,
            guest_email=guest_email,
            session_token=secrets.token_urlsafe(48),
            join_status=MeetingParticipant.JoinStatus.KNOCKING if participant is None else None,
        )
        if not participant.is_active:
            return Response({"detail": "Your request to join this meeting was denied."}, status=403)
        if participant.join_status == MeetingParticipant.JoinStatus.KNOCKING:
            return Response({
                "meeting": MeetingPublicSerializer(meeting).data,
                "guest_session_token": participant.guest_session_token,
                "join_status": participant.join_status,
                "video": None,
            }, status=202)
        join_participant(participant)
        return Response({
            "meeting": MeetingPublicSerializer(meeting).data,
            "guest_session_token": participant.guest_session_token,
            "join_status": participant.join_status,
            "video": build_jitsi_payload(meeting, display_name=participant.guest_name, email=participant.guest_email, moderator=False, participant_id=participant.id),
        })


class MeetingPublicLeaveAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, meeting_code):
        participant = MeetingParticipant.objects.filter(meeting__meeting_code=meeting_code, guest_session_token=request.data.get("guest_session_token"), is_active=True).first()
        if not participant:
            return Response({"detail": "Guest session not found."}, status=404)
        leave_participant(participant)
        return Response({"detail": "Left meeting."})


class MeetingPublicHeartbeatAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, meeting_code):
        participant = MeetingParticipant.objects.filter(meeting__meeting_code=meeting_code, guest_session_token=request.data.get("guest_session_token"), is_active=True).first()
        if not participant:
            return Response({"detail": "Guest session not found."}, status=404)
        mark_participant_seen(participant)
        return Response({"ok": True})


class MeetingPublicJoinStatusAPIView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, meeting_code):
        participant = MeetingParticipant.objects.filter(meeting__meeting_code=meeting_code, guest_session_token=request.query_params.get("guest_session_token")).first()
        if not participant:
            return Response({"status": "unknown"})
        return Response({"status": participant.join_status if participant.is_active else "denied"})


class MeetingAdmitAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, meeting_id):
        meeting = MeetingDetailAPIView().get_object(request, meeting_id)
        if not meeting or meeting.host_id != request.user.id:
            return Response({"detail": "Only the host can admit participants."}, status=403)
        participant = meeting.participants.filter(id=request.data.get("request_id"), join_status=MeetingParticipant.JoinStatus.KNOCKING).first()
        if not participant:
            return Response({"detail": "Join request not found."}, status=404)
        if request.data.get("approve"):
            participant.join_status = MeetingParticipant.JoinStatus.INVITED
            participant.save(update_fields=["join_status"])
        else:
            participant.is_active = False
            participant.save(update_fields=["is_active"])
        meeting.participants._remove_prefetched_objects()
        return Response(_serialize_meeting(meeting, request))


