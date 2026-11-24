from django.db import migrations


MEETING_SERIES_COLUMNS = [
    "id", "title", "description", "meeting_code", "external_join_pin_hash",
    "external_join_pin_ciphertext", "recurrence_frequency", "recurrence_rule",
    "timezone", "start_date", "end_date", "start_time", "duration_minutes",
    "working_days", "reminder_minutes_before", "is_active", "created_at",
    "updated_at", "host_id",
]

MEETING_COLUMNS = [
    "id", "title", "description", "meeting_type", "status", "scheduled_date",
    "start_time", "end_time", "duration_minutes", "is_recurring",
    "recurrence_rule", "meeting_code", "external_join_pin_hash",
    "external_join_pin_ciphertext", "access_type", "participant_permissions",
    "is_active", "created_at", "updated_at", "actual_start_time",
    "actual_end_time", "host_id", "parent_meeting_id", "series_id",
]


def _rebuild_table(cursor, table, columns, create_sql):
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if "workspace_id" not in existing:
        return

    temporary = f"{table}_account_owned_new"
    cursor.execute(f"DROP TABLE IF EXISTS {temporary}")
    cursor.execute(create_sql.format(table=temporary))
    common = [column for column in columns if column in existing]
    names = ", ".join(common)
    cursor.execute(f"INSERT INTO {temporary} ({names}) SELECT {names} FROM {table}")
    cursor.execute(f"DROP TABLE {table}")
    cursor.execute(f"ALTER TABLE {temporary} RENAME TO {table}")


def remove_workspace_and_legacy_tables(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return

    cursor = schema_editor.connection.cursor()
    cursor.execute("PRAGMA foreign_keys = OFF")

    _rebuild_table(
        cursor,
        "meetings_meetingseries",
        MEETING_SERIES_COLUMNS,
        """
        CREATE TABLE {table} (
            id integer NOT NULL PRIMARY KEY,
            title varchar(255) NOT NULL,
            description text NOT NULL,
            meeting_code varchar(12) NOT NULL,
            external_join_pin_hash varchar(128) NOT NULL,
            external_join_pin_ciphertext varchar(255) NOT NULL,
            recurrence_frequency varchar(20) NOT NULL,
            recurrence_rule varchar(120) NOT NULL,
            timezone varchar(64) NOT NULL,
            start_date date NOT NULL,
            end_date date NULL,
            start_time time NOT NULL,
            duration_minutes integer unsigned NOT NULL,
            working_days text NOT NULL,
            reminder_minutes_before integer unsigned NOT NULL,
            is_active bool NOT NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            host_id integer NOT NULL REFERENCES auth_user (id) DEFERRABLE INITIALLY DEFERRED
        )
        """,
    )
    _rebuild_table(
        cursor,
        "meetings_meeting",
        MEETING_COLUMNS,
        """
        CREATE TABLE {table} (
            id integer NOT NULL PRIMARY KEY,
            title varchar(255) NOT NULL,
            description text NOT NULL,
            meeting_type varchar(20) NOT NULL,
            status varchar(20) NOT NULL,
            scheduled_date date NOT NULL,
            start_time time NOT NULL,
            end_time time NULL,
            duration_minutes integer unsigned NOT NULL,
            is_recurring bool NOT NULL,
            recurrence_rule varchar(100) NOT NULL,
            meeting_code varchar(12) NOT NULL,
            external_join_pin_hash varchar(128) NOT NULL,
            external_join_pin_ciphertext varchar(255) NOT NULL,
            access_type varchar(20) NOT NULL,
            participant_permissions text NOT NULL,
            is_active bool NOT NULL,
            created_at datetime NOT NULL,
            updated_at datetime NOT NULL,
            actual_start_time datetime NULL,
            actual_end_time datetime NULL,
            host_id integer NOT NULL REFERENCES auth_user (id) DEFERRABLE INITIALLY DEFERRED,
            parent_meeting_id bigint NULL REFERENCES meetings_meeting (id) DEFERRABLE INITIALLY DEFERRED,
            series_id bigint NULL REFERENCES meetings_meetingseries (id) DEFERRABLE INITIALLY DEFERRED
        )
        """,
    )

    cursor.execute("CREATE INDEX IF NOT EXISTS meetings_me_host_date_idx ON meetings_meeting (host_id, scheduled_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS meetings_me_host_status_idx ON meetings_meeting (host_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS meetings_me_meeting_code_idx ON meetings_meeting (meeting_code)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_meeting_series_date ON meetings_meeting (series_id, scheduled_date) WHERE series_id IS NOT NULL AND is_active = 1")

    legacy_tables = [
        "accounts_tab",
        "clients_client",
        "copilot_copilotauditevent",
        "copilot_copilotconversation",
        "copilot_copilotmessage",
        "copilot_copilotrun",
        "discussions_channelmembership",
        "discussions_message",
        "discussions_channel",
        "doclate_doclatedocument",
        "members_department",
        "members_workspacemembers",
        "projects_project",
        "meetings_meetingaisummary",
        "meetings_meetingrecording",
        "meetings_meetingsummaryjob",
        "meetings_meetingtranscriptionsession",
        "meetings_meetingtranscriptsegment",
        "accounts_workspace",
    ]
    for table in legacy_tables:
        cursor.execute(f"DROP TABLE IF EXISTS {table}")

    cursor.execute("PRAGMA foreign_keys = ON")


class Migration(migrations.Migration):
    dependencies = [("meetings", "0003_add_meeting_integrity_indexes")]
    operations = [migrations.RunPython(remove_workspace_and_legacy_tables, migrations.RunPython.noop)]
