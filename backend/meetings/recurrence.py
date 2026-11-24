"""Per-meeting recurrence expansion.

Additive helper: turns an RRULE string (as produced by the Schedule modal's
Recurrence picker — daily / weekly / monthly / yearly / custom interval, with
optional UNTIL or COUNT) into a bounded list of occurrence dates.

It is used for standalone meetings created with `is_recurring=True` and a
`recurrence_rule`.
"""

import datetime
import re

from dateutil.rrule import rrulestr

# Safety bounds so an open-ended rule (no UNTIL/COUNT) can't generate forever.
# Horizon is generous (≈2 years) so yearly/long-interval rules still produce at
# least one occurrence; max_count keeps daily/weekly rules from flooding rows.
DEFAULT_MAX_OCCURRENCES = 12
DEFAULT_HORIZON_DAYS = 800


def _naive_rule(rule_str):
    """Strip an aware UNTIL (trailing ``Z``) so it matches our naive dtstart.

    The project runs USE_TZ=False, so ``dtstart`` is seeded naive. A tz-aware
    UNTIL (e.g. ``UNTIL=20261231T235959Z``) makes dateutil raise a TypeError
    mid-iteration (naive vs aware compare) and the whole rule silently drops to
    ``[]``. Removing the trailing ``Z`` keeps UNTIL naive and comparable.
    """
    return re.sub(r"(UNTIL=\d{8}T\d{6})Z", r"\1", rule_str or "", flags=re.IGNORECASE)


def expand_occurrences(
    rule_str,
    start_date,
    *,
    max_count=DEFAULT_MAX_OCCURRENCES,
    horizon_days=DEFAULT_HORIZON_DAYS,
):
    """Return occurrence dates AFTER ``start_date`` for the given RRULE.

    The seed date itself is excluded (the parent meeting already lives on it).
    If the rule carries COUNT/UNTIL it is honoured; otherwise generation stops
    at ``max_count`` occurrences or ``horizon_days``, whichever comes first.
    Returns ``[]`` for blank/invalid rules (never raises).
    """
    rule_str = (rule_str or "").strip()
    if not rule_str or not isinstance(start_date, datetime.date):
        return []

    dtstart = datetime.datetime.combine(start_date, datetime.time.min)
    try:
        rule = rrulestr(_naive_rule(rule_str), dtstart=dtstart)
    except (ValueError, TypeError):
        return []

    upper = rule_str.upper()
    bounded = ("COUNT=" in upper) or ("UNTIL=" in upper)
    horizon = dtstart + datetime.timedelta(days=horizon_days)

    dates = []
    try:
        for occ in rule:
            occ_date = occ.date() if isinstance(occ, datetime.datetime) else occ
            if occ_date <= start_date:
                continue
            # A COUNT/UNTIL-bounded rule carries its own limit — honour it fully
            # instead of truncating at max_count / horizon (which are only safety
            # bounds for open-ended rules that would otherwise generate forever).
            if not bounded:
                if occ > horizon:
                    break
                if len(dates) >= max_count:
                    break
            dates.append(occ_date)
    except (ValueError, TypeError, OverflowError):
        # Aware/naive mismatch or overflow mid-iteration — return whatever we have.
        return dates
    return dates


def validate_recurrence_rule(rule_str, start_date):
    """Raise ``ValueError`` if an RRULE is malformed or yields no occurrences.

    Used at create/update time so a bad rule surfaces as a clear 400 instead of
    silently expanding to zero occurrences.
    """
    rule_str = (rule_str or "").strip()
    if not rule_str:
        return
    if len(rule_str) > 100:
        raise ValueError("Recurrence rule is too long (max 100 characters).")
    base = start_date if isinstance(start_date, datetime.date) else datetime.date.today()
    dtstart = datetime.datetime.combine(base, datetime.time.min)
    try:
        rule = rrulestr(_naive_rule(rule_str), dtstart=dtstart)
        # Indexing forces evaluation of the first occurrence: parse errors raise
        # ValueError/TypeError, a rule that yields nothing raises IndexError.
        _first = rule[0]
    except (ValueError, TypeError, IndexError, OverflowError):
        raise ValueError("Invalid recurrence rule.")


_WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_ORDINALS = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", -1: "last"}


def describe(rule_str, start_date=None):
    """Best-effort human summary of an RRULE (for API responses / debugging)."""
    rule_str = (rule_str or "").strip()
    if not rule_str:
        return ""
    parts = {}
    for chunk in rule_str.replace("RRULE:", "").split(";"):
        if "=" in chunk:
            key, _, val = chunk.partition("=")
            parts[key.strip().upper()] = val.strip().upper()

    freq = parts.get("FREQ", "")
    interval = int(parts.get("INTERVAL", "1") or "1")
    unit = {"DAILY": "day", "WEEKLY": "week", "MONTHLY": "month", "YEARLY": "year"}.get(freq, "time")
    plural = unit if interval == 1 else f"{unit}s"
    every = f"every {interval} {plural}" if interval > 1 else f"{unit}ly" if freq == "DAILY" else f"every {unit}"

    if freq == "DAILY":
        return "This meeting will occur daily." if interval == 1 else f"This meeting will occur every {interval} days."
    if freq == "WEEKLY":
        byday = parts.get("BYDAY", "")
        names = {"MO": "Monday", "TU": "Tuesday", "WE": "Wednesday", "TH": "Thursday", "FR": "Friday", "SA": "Saturday", "SU": "Sunday"}
        days = [names.get(d, d) for d in byday.split(",") if d]
        day_text = ", ".join(days) if days else ""
        if interval == 1:
            return f"This meeting will occur every week on {day_text}." if day_text else "This meeting will occur weekly."
        return f"This meeting will occur every {interval} weeks on {day_text}." if day_text else f"This meeting will occur every {interval} weeks."
    if freq == "MONTHLY":
        if parts.get("BYMONTHDAY"):
            return f"This meeting will occur on day {parts['BYMONTHDAY']} of every month."
        return f"This meeting will occur {every} based on the selected schedule."
    if freq == "YEARLY":
        return "This meeting will occur annually." if interval == 1 else f"This meeting will occur every {interval} years."
    return ""
