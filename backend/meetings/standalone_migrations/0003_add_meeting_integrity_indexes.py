from django.db import migrations


def add_integrity_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "sqlite":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_meeting_series_date ON meetings_meeting (series_id, scheduled_date) WHERE series_id IS NOT NULL AND is_active = 1")


class Migration(migrations.Migration):
    dependencies = [("meetings", "0002_remove_legacy_meeting_columns")]
    operations = [migrations.RunPython(add_integrity_indexes, migrations.RunPython.noop)]
