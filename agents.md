# Private Meetings — Agent Guide

This file is the source of truth for agents working on the Private Meetings project. Keep it current whenever the backend contract, frontend meeting flow, permissions, Jitsi integration, or development commands change.

## Project overview

Private Meetings is a Django REST API with a Vite/React frontend for authenticated scheduled meetings, instant meetings, recurring meetings, registered invitations, external guest links, host approval, and self-hosted Jitsi video.

Repository layout:

- `backend/` — Django project, REST API, authentication, meeting models, permissions, attendance, and Jitsi JWT generation.
- `frontend/` — React/Vite application, authenticated meeting workspace, room UI, guest join flow, participant panel, and Jitsi iframe integration.
- `design-qa.md` — existing visual/design QA notes.
- `agents.md` — this guide; update it with every material implementation change.
- `.github/workflows/ci.yml` — GitHub Actions checks for backend and frontend changes.
- `.gitignore` — repository-wide protection for secrets, local databases, dependencies, and build output.

## Stack and commands

Backend:

```bash
cd backend
.venv/bin/python manage.py runserver
```

Useful backend checks:

```bash
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/python -m compileall -q backend/meetings
npm --prefix frontend run test:run
npm --prefix frontend run build
```

Frontend:

```bash
cd frontend
npm install
npm run start
npm run build
npm run test:run
```

The frontend API base URL is `VITE_API_URL`, defaulting to `http://127.0.0.1:8000` in `frontend/src/utilities/api.js`.

The frontend test suite uses Vitest with a jsdom environment. Backend meeting tests live in `backend/meetings/tests.py` and are run with the `meetings` app label because the project uses a standalone meeting migration history.

## Backend architecture

The backend is a Django 5 + Django REST Framework application. The main meeting code lives in `backend/meetings/`:

- `models.py` — meetings, recurring series, participants, and attendance sessions.
- `serializers.py` — request validation and read representations.
- `views.py` — authenticated and public API endpoints.
- `services.py` — joining, leaving, heartbeat tracking, counts, invitation synchronization, recurrence expansion, and automatic ending.
- `video_provider.py` — Jitsi room names, health status, and JWT payloads.
- `recurrence.py` — recurrence-rule expansion.

Authentication is required for `/api/meetings/...` endpoints. Public guest-link endpoints are deliberately `AllowAny` and use a guest session token for subsequent leave, heartbeat, and join-status requests.

## Domain model and statuses

### Meeting

`Meeting` has:

- lifecycle status: `scheduled`, `live`, `ended`, or `cancelled`;
- type: `instant`, `scheduled`, or `recurring`;
- access type: `trusted` or `open`;
- host, generated meeting code, schedule/duration, optional external PIN, and participant permissions;
- Jitsi room identity derived from the meeting code.

Meeting PINs are stored as a hash for verification and encrypted ciphertext for controlled retrieval. Do not expose PIN material in API responses or logs.

### Participants

`MeetingParticipant.role` is one of:

- `host` — the meeting owner;
- `participant` — a registered internal user;
- `guest` — an external participant using an email and guest session token.

`join_status` is one of `invited`, `joined`, `left`, or `knocking`.

Only the meeting host is a moderator. Registered invitees and external guests must remain ordinary participants in Jitsi, even when they were invited directly.

`MeetingParticipantSession` records open and closed attendance sessions. Heartbeats update `last_seen_at`; a participant is considered live only within the configured heartbeat timeout.

## Permission rules

These rules must be enforced in both the UI and the backend. The backend is authoritative.

### Host/moderator-only actions

Only `meeting.host_id == request.user.id` may:

- invite registered users or guest email addresses;
- update or cancel a meeting;
- admit or deny a knocking participant;
- end the meeting for everyone;
- use Jitsi moderator actions such as asking to unmute, muting others, disabling other cameras, stopping others’ screen sharing, kicking participants, or granting moderator rights.

The Jitsi JWT marks only the host with `context.user.moderator = true` and `affiliation = owner`. Never infer moderator access from a participant-supplied field or from the email address alone.

### Actions available to all joined participants

All participants may:

- open the People panel;
- see the host marker and current participants;
- copy the meeting link;
- use their own microphone/camera controls;
- chat or use other explicitly participant-safe controls;
- leave the meeting.

The room UI labels the ordinary action `Leave meeting` and the host action `End meeting for all`.

## Join and invitation flows

### Registered users

When the host adds an email that matches an active registered account, `ensure_email_invitees()` creates or reuses an internal participant record. The invited user’s authenticated meeting list includes the meeting because `_list_queryset()` returns meetings where the user is the host or an active participant.

The frontend marks these cards with `Invited by <host name>` and provides a direct `Join` button in Scheduled Meetings.

An authenticated user who reaches a meeting without an existing invitation is created as `knocking`. They see a waiting screen until the host admits them; after admission the frontend polls the meeting detail and joins automatically.

### External guests

Guests use `/join/<meeting_code>` and submit name, email, and an optional PIN. An unknown guest is created as `knocking`, receives a `guest_session_token`, and waits for host approval. An invited guest can join directly.

Guest status is polled through the public join-status endpoint. Once the host changes `knocking` to `invited`, the guest submits the stored form again and receives a Jitsi payload. Denied guests receive a clear denial state and cannot enter the room.

The public People panel uses the public meeting lookup and preserves the participant snapshot if a refresh request temporarily fails; it must not show a misleading `Meeting not found` state for a valid active room.

### Host approval

`MeetingAdmitAPIView` is host-only. The host’s People panel polls for pending `knocking` requests and shows Admit/Deny controls. Non-host participants may see pending requests but never receive those controls.

## API surface

Authenticated endpoints are defined in `backend/meetings/urls.py` and mirrored in `frontend/src/utilities/api.js`:

- `GET/POST /api/meetings/` — list or create meetings.
- `GET/POST /api/meetings/series/` — list or create recurring series.
- `GET /api/meetings/counts/` — workspace tab counts.
- `GET /api/meetings/upcoming/` — scheduled/live meetings.
- `POST /api/meetings/instant/` — create and immediately join an instant meeting.
- `GET/PATCH/DELETE /api/meetings/<id>/` — detail, host update, or host cancellation.
- `POST /api/meetings/<id>/join/` — join or create an authenticated knocking request.
- `POST /api/meetings/<id>/leave/` — leave as an authenticated participant.
- `POST /api/meetings/<id>/heartbeat/` — maintain live presence.
- `POST /api/meetings/<id>/end/` — host-only end-for-all operation.
- `POST /api/meetings/<id>/admit/` — host-only admit or deny operation.
- `POST /api/meetings/<id>/participants/` — host-only invitation operation.
- `GET /api/health/video/` — Jitsi configuration readiness.

Public guest endpoints are:

- `GET /api/public/<code>/` — public meeting lookup.
- `POST /api/public/<code>/verify-pin/` — optional PIN verification.
- `POST /api/public/<code>/join/` — guest join/request flow.
- `POST /api/public/<code>/leave/` — guest leave using the session token.
- `POST /api/public/<code>/heartbeat/` — guest heartbeat.
- `GET /api/public/<code>/join-status/` — guest approval status.

When adding an endpoint, update both `backend/meetings/urls.py` and `frontend/src/utilities/api.js`, then document the permission and status behavior here.

## Frontend architecture

Important routes in `frontend/src/App.jsx`:

- `/login` and `/signup` — authentication.
- `/` — home page.
- `/meetings` — authenticated workspace and meeting schedule.
- `/meetings/:meetingId/room` — authenticated host or registered participant room.
- `/join/:meetingCode` — public guest room.

Important meeting components:

- `MeetingsPage.jsx` — scheduled/past tabs, invitations, `Invited by` label, meeting creation, recurring series, instant meetings, cancellation, and direct join actions.
- `ScheduleMeetingModal.jsx` — scheduled/instant-compatible meeting form, access choice, PIN, recurring option, and email invitations.
- `EditMeetingModal.jsx` — host editing flow.
- `MeetingRoom.jsx` — authenticated join, waiting, heartbeat, People panel, copy link, leave, and host end-for-all.
- `PublicMeetingRoom.jsx` — external guest form, approval waiting, guest heartbeat, public People panel, copy link, and leave.
- `ParticipantsPanel.jsx` — host marker, participants, invitations, pending requests, and host-only Admit/Deny controls.
- `JitsiMeetingFrame.jsx` — external Jitsi API loading, JWT handoff, role-aware controls, and video lifecycle events.
- `meetingLink.js` — meeting URL creation and clipboard fallback.
- `meetingWindow.js` — detects `meeting_tab=1` and closes the meeting tab after leaving when the browser permits it.

## New-tab behavior

Instant and newly scheduled non-recurring meetings open in a separate browser tab. The tab is initially opened synchronously to avoid popup blocking, then navigated to the room after the API creates the meeting. The URL includes `meeting_tab=1`.

When a participant leaves, or when the host ends the meeting, the room tries to close that tab. If the browser refuses `window.close()`, it falls back to navigating back to the relevant meeting/home page.

Do not remove the synchronous placeholder-tab opening unless popup-blocker handling is redesigned.

## Jitsi integration

The app expects a self-hosted Jitsi deployment. The application reads Jitsi settings from `backend/.env` through `backend/private_meetings/settings.py`:

- `JITSI_PROVIDER=self_hosted`
- `JITSI_DOMAIN`
- `JITSI_APP_ID`
- `JITSI_APP_SECRET`
- `JITSI_JWT_SUB`
- `JITSI_ROOM_PREFIX`
- `MEETINGS_VIDEO_ENABLED`
- development-only unsecured/public flags

The local Jitsi Docker project is outside this repository at `/Users/akanshabharti/docker-jitsi-meet`. Its current moderator-related setup includes:

- `ENABLE_AUTO_OWNER=0`
- `ENABLE_MODERATOR_CHECKS=1`
- `DISABLE_GRANT_MODERATOR=1`

Do not commit Jitsi secrets. Keep the app’s JWT secret aligned with the Jitsi deployment secret through local environment configuration.

`JitsiMeetingFrame.jsx` applies additional client restrictions:

- guests have `remoteVideoMenu.disabled = true` because this self-hosted Jitsi build does not consistently hide moderator actions based on role;
- only moderators receive Jitsi’s embedded `hangup` toolbar control, because that control opens the dialog containing `End meeting for all`;
- guests retain the app-level `Leave meeting` control and participant-safe Jitsi controls.

If the Jitsi image or version changes, re-test host and guest behavior. Do not rely on UI hiding alone; keep JWT roles and backend authorization correct.

## Production configuration

`backend/private_meetings/settings.py` is environment-driven. Set `ENVIRONMENT=production` and `DEBUG=False` in production. Production must provide a long random `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS`. HTTPS redirect, HSTS, secure cookies, clickjacking protection, password validators, and DRF throttling are enabled/configured through settings.

Use `DB_ENGINE=postgresql` with the `DB_*` variables and install the pinned PostgreSQL driver from `backend/requirements.txt`. SQLite and the local `db.sqlite3` file are for development only. Configure a shared cache/rate-limit backend when deploying multiple application processes.

The root `.gitignore` protects `.env` files, SQLite databases, virtual environments, `frontend/node_modules`, `frontend/dist`, caches, logs, IDE files, and coverage output. Never override those protections to publish local data or credentials.

## Lifecycle and automatic ending

- A first successful `join_participant()` changes a scheduled meeting to `live` and records `actual_start_time`.
- A host end-for-all or an empty live room ends the meeting and records `actual_end_time`.
- Stale live meetings and expired scheduled meetings are reconciled during meeting reads using configured heartbeat and expiry grace periods.
- A cancelled meeting becomes inactive and cannot be joined.
- Ended/cancelled rooms return HTTP 410 from join endpoints.

## Change guidelines for future agents

1. Preserve host-only authorization in backend views even if the frontend already hides a control.
2. Keep registered invitations, guest invitations, and knocking requests distinct; do not turn a guest into a moderator.
3. When changing a meeting status or join status, update both authenticated and public flows if applicable.
4. Keep the People panel usable for guests and non-hosts while protecting invitation and admission controls.
5. When changing Jitsi controls, test both a host JWT and a guest JWT in separate browser contexts.
6. When changing meeting-tab behavior, verify popup opening, host end, participant leave, guest leave, and browser fallback navigation.
7. Update this file in the same change whenever any documented endpoint, permission, UI contract, environment variable, or verification command changes.
8. Never place real credentials, tokens, PINs, or copied production data in this file.

## Verification checklist

Before handing off meeting-related work, run:

```bash
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/python -m compileall -q backend/meetings
backend/.venv/bin/python backend/manage.py makemigrations --check --dry-run
backend/.venv/bin/python backend/manage.py test meetings
npm --prefix frontend run test:run
npm --prefix frontend run build
```

GitHub Actions runs the backend checks/tests and frontend tests/build for pushes to `main` and pull requests.

For permission or Jitsi changes, also manually verify:

- host sees People, Copy meet link, Leave meeting, and End meeting for all;
- registered invitee sees `Invited by <host>` and can join from Scheduled Meetings;
- unknown registered user and external guest enter the host-approval waiting flow;
- host sees and can Admit/Deny pending requests;
- guest sees participants and host badge but no moderator actions;
- guest does not see the Jitsi hang-up/end-for-all control;
- host end-for-all ends the meeting for everyone;
- participant leave closes a meeting tab when it was opened with `meeting_tab=1`;
- microphone/camera permission failures remain non-fatal and do not grant moderator access.

