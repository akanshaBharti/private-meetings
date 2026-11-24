from django.db import migrations


def _rebuild_table(cursor, table, columns, create_sql):
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if "ai_notes_enabled" not in existing and "member_id" not in existing and "department" not in existing:
        return

    cursor.execute("PRAGMA foreign_keys = OFF")
    temporary = f"{table}_private_meetings_new"
    cursor.execute(f"DROP TABLE IF EXISTS {temporary}")
    cursor.execute(create_sql.format(table=temporary))
    common = [column for column in columns if column in existing]
    names = ", ".join(common)
    cursor.execute(f"INSERT INTO {temporary} ({names}) SELECT {names} FROM {table}")
    cursor.execute(f"DROP TABLE {table}")
    cursor.execute(f"ALTER TABLE {temporary} RENAME TO {table}")
    cursor.execute("PRAGMA foreign_keys = ON")


def remove_legacy_columns(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return
    cursor = schema_editor.connection.cursor()
    _rebuild_table(
        cursor,
        "meetings_meetingseries",
        ["id", "title", "description", "meeting_code", "external_join_pin_hash", "external_join_pin_ciphertext", "recurrence_frequency", "recurrence_rule", "timezone", "start_date", "end_date", "start_time", "duration_minutes", "working_days", "reminder_minutes_before", "is_active", "created_at", "updated_at", "host_id", "workspace_id"],
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
            host_id integer NOT NULL REFERENCES auth_user (id) DEFERRABLE INITIALLY DEFERRED,
            workspace_id bigint NOT NULL REFERENCES accounts_workspace (id) DEFERRABLE INITIALLY DEFERRED
        )
        """,
    )
    _rebuild_table(
        cursor,
        "meetings_meeting",
        ["id", "title", "description", "meeting_type", "status", "scheduled_date", "start_time", "end_time", "duration_minutes", "is_recurring", "recurrence_rule", "meeting_code", "external_join_pin_hash", "external_join_pin_ciphertext", "access_type", "participant_permissions", "is_active", "created_at", "updated_at", "actual_start_time", "actual_end_time", "host_id", "parent_meeting_id", "series_id", "workspace_id"],
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
            series_id bigint NULL REFERENCES meetings_meetingseries (id) DEFERRABLE INITIALLY DEFERRED,
            workspace_id bigint NOT NULL REFERENCES accounts_workspace (id) DEFERRABLE INITIALLY DEFERRED
        )
        """,
    )
    _rebuild_table(
        cursor,
        "meetings_meetingparticipant",
        ["id", "guest_name", "guest_email", "guest_session_token", "role", "join_status", "joined_at", "left_at", "last_seen_at", "is_active", "created_at", "meeting_id", "user_id"],
        """
        CREATE TABLE {table} (
            id integer NOT NULL PRIMARY KEY,
            guest_name varchar(100) NOT NULL,
            guest_email varchar(254) NOT NULL,
            guest_session_token varchar(96) NOT NULL,
            role varchar(20) NOT NULL,
            join_status varchar(20) NOT NULL,
            joined_at datetime NULL,
            left_at datetime NULL,
            last_seen_at datetime NULL,
            is_active bool NOT NULL,
            created_at datetime NOT NULL,
            meeting_id bigint NOT NULL REFERENCES meetings_meeting (id) DEFERRABLE INITIALLY DEFERRED,
            user_id integer NULL REFERENCES auth_user (id) DEFERRABLE INITIALLY DEFERRED
        )
        """,
    )
    cursor.execute("PRAGMA table_info(meetings_meeting)")
    meeting_columns = {row[1] for row in cursor.fetchall()}
    if "workspace_id" in meeting_columns:
        cursor.execute("CREATE INDEX IF NOT EXISTS meetings_me_workspa_32eba1_idx ON meetings_meeting (workspace_id, scheduled_date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS meetings_me_workspa_d9a3a4_idx ON meetings_meeting (workspace_id, status)")
    cursor.execute("CREATE INDEX IF NOT EXISTS meetings_me_meeting_code_idx ON meetings_meeting (meeting_code)")
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_meeting_series_date ON meetings_meeting (series_id, scheduled_date) WHERE series_id IS NOT NULL AND is_active = 1")
    cursor.execute("CREATE INDEX IF NOT EXISTS meeting_part_seen_idx ON meetings_meetingparticipant (meeting_id, join_status, last_seen_at)")


class Migration(migrations.Migration):
    dependencies = [("meetings", "0001_initial")]
    operations = [migrations.RunPython(remove_legacy_columns, migrations.RunPython.noop)]
