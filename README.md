# Private Meetings

Private Meetings is a Django REST API and React/Vite frontend for scheduled, instant, recurring, and guest-approved video meetings using self-hosted Jitsi.

## Local development

### Backend

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python manage.py migrate
.venv/bin/python manage.py runserver
```

### Frontend

```bash
cd frontend
npm ci
npm run start
```

The frontend defaults to `http://127.0.0.1:8000` for the API and runs on port 3000. Set `VITE_API_URL` when the API is hosted elsewhere.

## Production requirements

Set `DEBUG=False`, `ENVIRONMENT=production`, a long random `DJANGO_SECRET_KEY`, production `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS`. Configure HTTPS at the reverse proxy and set the secure-cookie/HSTS variables as appropriate.

Use PostgreSQL by setting `DB_ENGINE=postgresql` and the `DB_*` connection variables. Do not use the local SQLite database in production.

Configure a self-hosted Jitsi deployment with the same `JITSI_APP_ID`, `JITSI_APP_SECRET`, `JITSI_JWT_SUB`, and room prefix expected by the backend. Never commit `.env` files, database files, Jitsi secrets, or generated frontend dependencies/build output.

## Verification

```bash
backend/.venv/bin/python backend/manage.py check
backend/.venv/bin/python backend/manage.py makemigrations --check --dry-run
backend/.venv/bin/python backend/manage.py test meetings
npm --prefix frontend run test:run
npm --prefix frontend run build
```

GitHub Actions runs these checks for pushes to `main` and pull requests. See [agents.md](agents.md) for the meeting permission model and implementation guide.
