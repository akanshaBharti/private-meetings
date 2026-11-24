from django.contrib import admin

from .models import Meeting, MeetingParticipant, MeetingSeries


admin.site.register(Meeting)
admin.site.register(MeetingSeries)
admin.site.register(MeetingParticipant)
