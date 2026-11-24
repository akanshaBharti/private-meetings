import datetime

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .models import Meeting, MeetingParticipant, MeetingSeries
from .recurrence import validate_recurrence_rule
from .services import ensure_email_invitees, ensure_internal_participant


User = get_user_model()


def user_name(user):
    if not user:
        return ""
    return user.get_full_name() or user.email or user.username


class ParticipantReadSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()

    class Meta:
        model = MeetingParticipant
        fields = ["id", "user_id", "name", "email", "guest_name", "guest_email", "role", "join_status", "joined_at", "left_at", "is_active"]

    def get_name(self, obj):
        return user_name(obj.user) or obj.guest_name or obj.guest_email

    def get_email(self, obj):
        return (obj.user.email if obj.user else "") or obj.guest_email


class MeetingReadSerializer(serializers.ModelSerializer):
    id = serializers.CharField(read_only=True)
    host_info = serializers.SerializerMethodField()
    participants = ParticipantReadSerializer(many=True, read_only=True)
    participants_preview = serializers.SerializerMethodField()
    external_pin_manageable = serializers.SerializerMethodField()
    external_pin = serializers.SerializerMethodField()
    video = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id", "title", "description", "meeting_type", "status", "scheduled_date", "start_time", "end_time",
            "duration_minutes", "is_recurring", "recurrence_rule", "series_id", "meeting_code", "host_info",
            "access_type", "participant_permissions", "participants", "participants_preview", "external_pin_required",
            "external_pin_manageable", "external_pin", "actual_start_time", "actual_end_time", "created_at", "updated_at",
            "video",
        ]

    def get_host_info(self, obj):
        return {"id": obj.host_id, "name": user_name(obj.host), "email": obj.host.email}

    def get_participants_preview(self, obj):
        return ParticipantReadSerializer(obj.participants.all()[:8], many=True).data

    def get_external_pin_manageable(self, obj):
        request = self.context.get("request")
        return bool(request and request.user.is_authenticated and obj.host_id == request.user.id)

    def get_external_pin(self, obj):
        return obj.get_external_join_pin() if self.get_external_pin_manageable(obj) else ""

    def get_video(self, obj):
        return None



class MeetingListSerializer(MeetingReadSerializer):
    class Meta(MeetingReadSerializer.Meta):
        fields = MeetingReadSerializer.Meta.fields


class MeetingPublicSerializer(serializers.ModelSerializer):
    host_name = serializers.SerializerMethodField()
    participants = ParticipantReadSerializer(many=True, read_only=True)

    class Meta:
        model = Meeting
        fields = ["id", "title", "description", "meeting_type", "status", "scheduled_date", "start_time", "duration_minutes", "meeting_code", "access_type", "external_pin_required", "host_name", "participants"]

    def get_host_name(self, obj):
        return user_name(obj.host)


class MeetingCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    scheduled_date = serializers.DateField(required=False)
    start_time = serializers.TimeField(required=False)
    duration_minutes = serializers.IntegerField(required=False, min_value=1, max_value=1440, default=30)
    meeting_type = serializers.ChoiceField(required=False, choices=Meeting.MeetingType.choices, default=Meeting.MeetingType.SCHEDULED)
    access_type = serializers.ChoiceField(required=False, choices=Meeting.AccessType.choices, default=Meeting.AccessType.TRUSTED)
    recurrence_rule = serializers.CharField(required=False, allow_blank=True, max_length=100, default="")
    is_recurring = serializers.BooleanField(required=False, default=False)
    guest_emails = serializers.ListField(child=serializers.EmailField(), required=False, default=list)
    participants = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, default=list)
    external_pin = serializers.CharField(required=False, allow_blank=True, max_length=20, default="")

    def validate(self, attrs):
        attrs.setdefault("scheduled_date", timezone.localdate())
        attrs.setdefault("start_time", (timezone.localtime() + datetime.timedelta(hours=1)).time().replace(second=0, microsecond=0))
        if attrs["is_recurring"] and attrs["recurrence_rule"]:
            try:
                validate_recurrence_rule(attrs["recurrence_rule"], attrs["scheduled_date"])
            except ValueError as exc:
                raise serializers.ValidationError({"recurrence_rule": str(exc)})
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        participant_ids = validated_data.pop("participants", [])
        guest_emails = validated_data.pop("guest_emails", [])
        raw_pin = validated_data.pop("external_pin", "")
        meeting = Meeting.objects.create(host=request.user, **validated_data)
        if raw_pin:
            meeting.set_external_join_pin(raw_pin)
            meeting.save(update_fields=["external_join_pin_hash", "external_join_pin_ciphertext"])
        MeetingParticipant.objects.create(meeting=meeting, user=request.user, role=MeetingParticipant.Role.HOST, join_status=MeetingParticipant.JoinStatus.INVITED)
        users = User.objects.filter(id__in=participant_ids, is_active=True).exclude(id=request.user.id)
        for user in users:
            ensure_internal_participant(meeting, user=user)
        ensure_email_invitees(meeting, guest_emails, exclude_user=request.user)
        return meeting


class MeetingUpdateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, required=False)
    description = serializers.CharField(allow_blank=True, required=False)
    scheduled_date = serializers.DateField(required=False)
    start_time = serializers.TimeField(required=False)
    duration_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)
    access_type = serializers.ChoiceField(choices=Meeting.AccessType.choices, required=False)
    external_pin = serializers.CharField(allow_blank=True, max_length=20, required=False)

    def update(self, instance, validated_data):
        raw_pin = validated_data.pop("external_pin", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if raw_pin is not None:
            if raw_pin:
                instance.set_external_join_pin(raw_pin)
            else:
                instance.external_join_pin_hash = ""
                instance.external_join_pin_ciphertext = ""
        instance.save()
        return instance


class AddParticipantsSerializer(serializers.Serializer):
    participants = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, default=list)
    guest_emails = serializers.ListField(child=serializers.EmailField(), required=False, default=list)


class MeetingSeriesCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True, default="")
    start_date = serializers.DateField(required=False)
    start_time = serializers.TimeField(required=False)
    duration_minutes = serializers.IntegerField(required=False, min_value=1, max_value=1440, default=30)
    recurrence_rule = serializers.CharField(required=False, allow_blank=True, default="FREQ=DAILY")
    timezone = serializers.CharField(required=False, max_length=64, default="Asia/Kolkata")
    end_date = serializers.DateField(required=False, allow_null=True, default=None)
    external_pin = serializers.CharField(required=False, allow_blank=True, default="")

    def create(self, validated_data):
        request = self.context["request"]
        raw_pin = validated_data.pop("external_pin", "")
        validated_data.setdefault("start_date", timezone.localdate())
        validated_data.setdefault("start_time", (timezone.localtime() + datetime.timedelta(hours=1)).time().replace(second=0, microsecond=0))
        series = MeetingSeries.objects.create(host=request.user, **validated_data)
        if raw_pin:
            series.set_external_join_pin(raw_pin)
            series.save(update_fields=["external_join_pin_hash", "external_join_pin_ciphertext"])
        return series


class MeetingSeriesReadSerializer(serializers.ModelSerializer):
    class Meta:
        model = MeetingSeries
        fields = "__all__"


class GuestJoinSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    email = serializers.EmailField()
    pin = serializers.CharField(required=False, allow_blank=True, default="")


class GuestPinVerifySerializer(serializers.Serializer):
    pin = serializers.CharField()
