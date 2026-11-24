from pathlib import Path
import os
import sys

from corsheaders.defaults import default_headers
from django.core.exceptions import ImproperlyConfigured


# Django 5.0's BaseContext.__copy__ uses copy(super()), which is no longer
# supported by Python 3.14. The admin uses this method while rendering pages.
# Keep the project's pinned Django version working until the framework can be
# upgraded to a Python 3.14-compatible release.
if sys.version_info >= (3, 14):
    from django.template.context import BaseContext

    def _copy_base_context(context):
        duplicate = type(context).__new__(type(context))
        duplicate.__dict__ = context.__dict__.copy()
        duplicate.dicts = context.dicts[:]
        return duplicate

    BaseContext.__copy__ = _copy_base_context


BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path):
    """Load simple KEY=value entries without overriding real environment variables."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def _env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _env_list(name, default):
    value = os.environ.get(name)
    if value is None:
        return list(default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return int(default)


_load_env_file(BASE_DIR / ".env")

DEPLOYMENT_ENV = os.environ.get("ENVIRONMENT", "development").strip().lower()
DEBUG = _env_bool("DEBUG", DEPLOYMENT_ENV != "production")
configured_secret_key = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not configured_secret_key and not DEBUG:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set when DEBUG=False.")
SECRET_KEY = configured_secret_key or "private-meetings-local-development-key"
ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", ["127.0.0.1", "localhost"])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "accounts",
    "meetings",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "private_meetings.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "private_meetings.wsgi.application"
ASGI_APPLICATION = "private_meetings.asgi.application"

if os.environ.get("DB_ENGINE", "sqlite").strip().lower() in {"postgres", "postgresql"}:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.environ.get("DB_NAME", "private_meetings"),
            "USER": os.environ.get("DB_USER", "private_meetings"),
            "PASSWORD": os.environ.get("DB_PASSWORD", ""),
            "HOST": os.environ.get("DB_HOST", "127.0.0.1"),
            "PORT": os.environ.get("DB_PORT", "5432"),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# This project owns a small, standalone meetings migration history.
MIGRATION_MODULES = {
    "meetings": "meetings.standalone_migrations",
}

MEETING_PIN_ENCRYPTION_KEY = os.environ.get("MEETING_PIN_ENCRYPTION_KEY", SECRET_KEY)
MEETINGS_VIDEO_ENABLED = _env_bool("MEETINGS_VIDEO_ENABLED", True)
JITSI_PROVIDER = os.environ.get("JITSI_PROVIDER", "self_hosted")
JITSI_DOMAIN = os.environ.get("JITSI_DOMAIN", "meet.jit.si")
JITSI_APP_ID = os.environ.get("JITSI_APP_ID", "private_meetings")
JITSI_APP_SECRET = os.environ.get("JITSI_APP_SECRET", "")
JITSI_JWT_SUB = os.environ.get("JITSI_JWT_SUB", JITSI_DOMAIN)
JITSI_ROOM_PREFIX = os.environ.get("JITSI_ROOM_PREFIX", "private")
JITSI_ALLOW_UNSECURED_DEV = _env_bool("JITSI_ALLOW_UNSECURED_DEV", DEBUG)
JITSI_ALLOW_PUBLIC_DEV = _env_bool("JITSI_ALLOW_PUBLIC_DEV", DEBUG)
MEETINGS_LIVE_HEARTBEAT_TIMEOUT_SECONDS = 90
MEETINGS_AUTO_END_STALE_AFTER_SECONDS = 180
MEETINGS_SCHEDULED_EXPIRY_GRACE_SECONDS = 900
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": os.environ.get("DRF_ANON_RATE", "100/hour"),
        "user": os.environ.get("DRF_USER_RATE", "1000/hour"),
        "auth": os.environ.get("DRF_AUTH_RATE", "10/minute"),
    },
}

CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS", [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
])
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-tab-key")
CSRF_TRUSTED_ORIGINS = _env_list("CSRF_TRUSTED_ORIGINS", CORS_ALLOWED_ORIGINS)

SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", not DEBUG)
SECURE_HSTS_SECONDS = _env_int("SECURE_HSTS_SECONDS", 31536000 if not DEBUG else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", not DEBUG)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", not DEBUG)
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", not DEBUG)
SESSION_COOKIE_HTTPONLY = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if _env_bool("SECURE_PROXY_SSL_HEADER", not DEBUG) else None
