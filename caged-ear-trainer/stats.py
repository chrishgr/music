"""Statistics for the profiles: points, practice time, daily/weekly/monthly summaries, progress,
suggestions for what to practise, and goals.

Pure functions over the rows of the attempts and sessions tables, so they can be tested without a server.
Times are stored in UTC. Everything that is grouped by day uses the browser's offset from UTC in minutes
(tz), so a day starts at local midnight. Weeks start on Monday.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

# ---------- the points system ----------
# A correct answer gives points by how much it takes: choosing an answer 1, playing a grip on the neck
# or holding a note with the voice 2. Wrong answers give nothing, so guessing does not pay.
ANSWER_POINTS = {
    "interval": 1, "chord": 1, "triad_recognize": 1, "caged_recognize": 1, "tuner_guess": 1,
    "triad_play": 2, "caged_play": 2, "tuner_hit": 2,
}
EXERCISES = list(ANSWER_POINTS)
# Practice without right or wrong answers, saved as sessions
ACTIVITIES = ["metronome", "drill", "progressions", "changes"]
STREAK_EVERY, STREAK_BONUS = 10, 5      # every 10th correct answer in a row gives 5 extra points
PRACTICE_POINTS_PER_DAY = 30            # 1 point per minute of metronome or play-along, at most 30 a day
DAY_BONUS = 5                           # every day with any practice, to reward practising often
# Practice time from answers: the time between two answers counts when it is at most two minutes,
# and the first answer after a pause counts as ten seconds
ANSWER_GAP, FIRST_ANSWER_SECONDS = 120, 10
MIN_ACCURACY_ANSWERS = 10               # an accuracy goal needs at least this many answers in the period

METRICS = ["points", "answers", "correct", "accuracy", "minutes", "days", "tempo", "changes"]
PERIODS = ["day", "week", "month", "until"]
ADDITIVE = {"points", "answers", "correct", "minutes", "days"}   # metrics that add up over the period


@dataclass
class Answer:
    when: datetime          # UTC
    exercise: str
    item: str
    correct: bool


@dataclass
class Session:
    when: datetime          # UTC, when the session ended
    activity: str
    detail: Optional[str]
    seconds: int
    bpm: Optional[int] = None
    value: Optional[int] = None


def parse_time(text: str) -> datetime:
    return datetime.fromisoformat(text)


def local_day(when: datetime, tz: int) -> date:
    return (when + timedelta(minutes=tz)).date()


def accuracy(correct: int, answers: int) -> Optional[float]:
    return round(correct / answers, 3) if answers else None


# ---------- periods ----------

def period_bounds(kind: str, day: date) -> tuple[date, date]:
    """First day of the day, week or month that contains `day`, and the first day after it."""
    if kind == "day":
        return day, day + timedelta(days=1)
    if kind == "week":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=7)
    if kind == "month":
        start = day.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        return start, nxt
    raise ValueError(f"Unknown period {kind}")


def previous_period(kind: str, start: date) -> tuple[date, date]:
    return period_bounds(kind, start - timedelta(days=1))


def compare_period(kind: str, start: date, today: Optional[date] = None) -> tuple[date, date, bool]:
    """The period to compare the one starting at `start` with. While a week or month is still going on,
    only as many days of the one before count as have passed, so a half-done week is not measured
    against a whole one. The last value is True when the period before was cut short like that."""
    pstart, pend = previous_period(kind, start)
    _, end = period_bounds(kind, start)
    if kind != "day" and today is not None and start <= today < end - timedelta(days=1):
        return pstart, min(pend, pstart + (today - start) + timedelta(days=1)), True
    return pstart, pend, False


def between(rows: Iterable, start: date, end: date, tz: int) -> list:
    """Rows whose local day is in [start, end)."""
    return [r for r in rows if start <= local_day(r.when, tz) < end]


# ---------- points and time ----------

def answer_seconds(answers: list[Answer]) -> int:
    total, last = 0, None
    for a in sorted(answers, key=lambda a: a.when):
        gap = (a.when - last).total_seconds() if last else None
        total += gap if gap is not None and gap <= ANSWER_GAP else FIRST_ANSWER_SECONDS
        last = a.when
    return int(total)


def streak_bonus(answers: list[Answer]) -> int:
    bonus = run = 0
    for a in sorted(answers, key=lambda a: a.when):
        run = run + 1 if a.correct else 0
        if run and run % STREAK_EVERY == 0:
            bonus += STREAK_BONUS
    return bonus


def score(answers: list[Answer], sessions: list[Session], tz: int, exercise: Optional[str] = None) -> dict:
    """Points with their parts. With an exercise, only the answers to that exercise count."""
    if exercise:
        answers = [a for a in answers if a.exercise == exercise]
        sessions = []
    answer_points = sum(ANSWER_POINTS.get(a.exercise, 1) for a in answers if a.correct)
    bonus = streak_bonus(answers)
    per_day: dict[date, int] = {}
    for s in sessions:
        d = local_day(s.when, tz)
        per_day[d] = per_day.get(d, 0) + s.seconds
    practice = sum(min(PRACTICE_POINTS_PER_DAY, secs // 60) for secs in per_day.values())
    days = len(active_days(answers, sessions, tz)) if not exercise else 0
    return {
        "answers": answer_points, "streaks": bonus, "practice": practice, "days": days * DAY_BONUS,
        "total": answer_points + bonus + practice + days * DAY_BONUS,
    }


def active_days(answers: list[Answer], sessions: list[Session], tz: int) -> set[date]:
    return {local_day(a.when, tz) for a in answers} | {local_day(s.when, tz) for s in sessions}


def totals(answers: list[Answer], sessions: list[Session], tz: int) -> dict:
    correct = sum(a.correct for a in answers)
    seconds = answer_seconds(answers) + sum(s.seconds for s in sessions)
    return {
        "answers": len(answers), "correct": correct, "accuracy": accuracy(correct, len(answers)),
        "minutes": round(seconds / 60, 1), "active_days": len(active_days(answers, sessions, tz)),
        "points": score(answers, sessions, tz)["total"],
    }


def streaks(answers: list[Answer]) -> tuple[int, int]:
    """Current and best run of correct answers."""
    best = run = 0
    for a in sorted(answers, key=lambda a: a.when):
        run = run + 1 if a.correct else 0
        best = max(best, run)
    return run, best


def practice_streak(answers: list[Answer], sessions: list[Session], tz: int, today: date) -> int:
    """Days in a row with practice, ending today (or yesterday, when today has nothing yet)."""
    days = active_days(answers, sessions, tz)
    d = today if today in days else today - timedelta(days=1)
    n = 0
    while d in days:
        n += 1
        d -= timedelta(days=1)
    return n


def by_exercise(answers: list[Answer]) -> list[dict]:
    out = []
    for ex in EXERCISES:
        mine = [a for a in answers if a.exercise == ex]
        if mine:
            c = sum(a.correct for a in mine)
            out.append({"exercise": ex, "answers": len(mine), "correct": c, "accuracy": accuracy(c, len(mine)),
                        "points": sum(ANSWER_POINTS[ex] for a in mine if a.correct)})
    return out


def by_item(answers: list[Answer], min_answers: int = 3) -> list[dict]:
    groups: dict[tuple[str, str], list[Answer]] = {}
    for a in answers:
        groups.setdefault((a.exercise, a.item), []).append(a)
    out = []
    for (ex, item), rows in groups.items():
        if len(rows) >= min_answers:
            c = sum(r.correct for r in rows)
            out.append({"exercise": ex, "item": item, "answers": len(rows), "correct": c, "accuracy": accuracy(c, len(rows))})
    return out


# ---------- summaries and progress ----------

def summary(answers: list[Answer], sessions: list[Session], kind: str, day: date, tz: int,
            today: Optional[date] = None) -> dict:
    """Everything in the day, week or month that contains `day`, compared with the period before
    (only its first days while the period is still going on, see compare_period)."""
    start, end = period_bounds(kind, day)
    pstart, pend, partial = compare_period(kind, start, today)
    a, s = between(answers, start, end, tz), between(sessions, start, end, tz)
    items = by_item(a)
    groups: dict[tuple[str, Optional[str]], list[Session]] = {}
    for x in s:
        groups.setdefault((x.activity, x.detail), []).append(x)
    days = []
    if kind != "day":
        d = start
        while d < end:
            da, ds = between(a, d, d + timedelta(days=1), tz), between(s, d, d + timedelta(days=1), tz)
            t = totals(da, ds, tz)
            days.append({"date": d.isoformat(), **{k: t[k] for k in ("answers", "correct", "accuracy", "minutes", "points")}})
            d += timedelta(days=1)
    return {
        "period": {"kind": kind, "start": start.isoformat(), "end": (end - timedelta(days=1)).isoformat()},
        "totals": totals(a, s, tz),
        "previous": {"start": pstart.isoformat(), "end": (pend - timedelta(days=1)).isoformat(), "partial": partial,
                     **totals(between(answers, pstart, pend, tz), between(sessions, pstart, pend, tz), tz)},
        "score": score(a, s, tz),
        "exercises": by_exercise(a),
        "best": sorted([i for i in items if i["accuracy"] >= 0.8], key=lambda i: (-i["accuracy"], -i["answers"]))[:5],
        "weakest": sorted([i for i in items if i["accuracy"] < 0.8], key=lambda i: (i["accuracy"], -i["answers"]))[:5],
        "sessions": sorted([{
            "activity": act, "detail": det, "count": len(rows), "minutes": round(sum(r.seconds for r in rows) / 60, 1),
            "best_bpm": max((r.bpm for r in rows if r.bpm), default=None),
            "best_value": max((r.value for r in rows if r.value is not None), default=None),
        } for (act, det), rows in groups.items()], key=lambda g: -g["minutes"]),
        "days": days,
    }


def progress(answers: list[Answer], sessions: list[Session], tz: int, today: date, weeks: int = 12) -> list[dict]:
    """One row per week for the last `weeks` weeks, oldest first, with accuracy per exercise."""
    this_week, _ = period_bounds("week", today)
    out = []
    for k in range(weeks - 1, -1, -1):
        start = this_week - timedelta(days=7 * k)
        end = start + timedelta(days=7)
        a, s = between(answers, start, end, tz), between(sessions, start, end, tz)
        t = totals(a, s, tz)
        out.append({"start": start.isoformat(), **t,
                    "exercises": {e["exercise"]: e["accuracy"] for e in by_exercise(a)}})
    return out


def exercise_trends(answers: list[Answer], tz: int, today: date) -> list[dict]:
    """Accuracy per exercise over all time, the last 14 days and the 14 days before."""
    recent = between(answers, today - timedelta(days=13), today + timedelta(days=1), tz)
    before = between(answers, today - timedelta(days=27), today - timedelta(days=13), tz)
    out = []
    for e in by_exercise(answers):
        ex = e["exercise"]
        r = [a for a in recent if a.exercise == ex]
        b = [a for a in before if a.exercise == ex]
        last = max(a.when for a in answers if a.exercise == ex)
        out.append({**e,
                    "recent": accuracy(sum(x.correct for x in r), len(r)), "recent_answers": len(r),
                    "before": accuracy(sum(x.correct for x in b), len(b)), "before_answers": len(b),
                    "days_since": (today - local_day(last, tz)).days})
    return out


# ---------- goals ----------

def metric_value(metric: str, scope: Optional[str], answers: list[Answer], sessions: list[Session], tz: int):
    """The value of a goal's metric over the answers and sessions of one period."""
    if scope in EXERCISES:
        answers = [a for a in answers if a.exercise == scope]
    if scope in ACTIVITIES:
        sessions = [s for s in sessions if s.activity == scope]
    if metric == "points":
        return score(answers, sessions, tz, exercise=scope if scope in EXERCISES else None)["total"]
    if metric == "answers":
        return len(answers)
    if metric == "correct":
        return sum(a.correct for a in answers)
    if metric == "accuracy":
        return round(100 * sum(a.correct for a in answers) / len(answers), 1) if answers else None
    if metric == "minutes":
        secs = (answer_seconds(answers) if scope not in ACTIVITIES else 0) + (sum(s.seconds for s in sessions) if scope not in EXERCISES else 0)
        return round(secs / 60, 1)
    if metric == "days":
        return len(active_days(answers, sessions if scope not in EXERCISES else [], tz))
    if metric == "tempo":   # the highest tempo reached with the metronome, in one exercise or any
        rows = [s for s in sessions if s.activity in ("metronome", "drill") and s.bpm and (not scope or scope in ACTIVITIES or s.detail == scope)]
        return max((s.bpm for s in rows), default=0)
    if metric == "changes":   # the best One minute changes result, for one pair of chords or any
        rows = [s for s in sessions if s.activity == "changes" and s.value is not None and (not scope or scope in ACTIVITIES or s.detail == scope)]
        return max((s.value for s in rows), default=0)
    raise ValueError(f"Unknown metric {metric}")


def is_met(metric: str, value, target: float, answers_in_period: int) -> bool:
    if value is None:
        return False
    if metric == "accuracy" and answers_in_period < MIN_ACCURACY_ANSWERS:
        return False
    return value >= target


def goal_progress(goal: dict, answers: list[Answer], sessions: list[Session], tz: int, today: date, history: int = 6) -> dict:
    """Where a goal stands today. A day, week or month goal starts again every period and keeps a history
    of the last periods; a long-term goal runs from the day it was set to its last day (due)."""
    metric, scope, target, kind = goal["metric"], goal["scope"], goal["target"], goal["period"]
    if kind == "until":
        start = local_day(parse_time(goal["created_at"]), tz)
        due = date.fromisoformat(goal["due"])
        end = due + timedelta(days=1)
    else:
        start, end = period_bounds(kind, today)
    upto = min(end, today + timedelta(days=1))
    a, s = between(answers, start, upto, tz), between(sessions, start, upto, tz)
    value = metric_value(metric, scope, a, s, tz)
    scoped_answers = len([x for x in a if not scope or scope not in EXERCISES or x.exercise == scope])
    met = is_met(metric, value, target, scoped_answers)
    days_total = (end - start).days
    days_left = max(0, (end - today).days) if today < end else 0
    out = {**goal, "start": start.isoformat(), "end": (end - timedelta(days=1)).isoformat(), "value": value, "met": met,
           "fraction": min(1.0, (value or 0) / target) if target else 0.0, "days_left": days_left,
           "expired": kind == "until" and today >= end and not met,
           "per_day": None, "behind": False, "answers_in_period": scoped_answers}
    if metric in ADDITIVE and not met and days_left:
        out["per_day"] = round((target - (value or 0)) / days_left, 1)
        elapsed = (days_total - days_left + 1) / days_total
        out["behind"] = (value or 0) < 0.8 * target * elapsed
    if kind != "until":
        hist, d = [], start
        for _ in range(history):
            hs, he = period_bounds(kind, d)
            ha, hss = between(answers, hs, he, tz), between(sessions, hs, he, tz)
            v = metric_value(metric, scope, ha, hss, tz)
            n = len([x for x in ha if not scope or scope not in EXERCISES or x.exercise == scope])
            hist.append({"start": hs.isoformat(), "value": v, "met": is_met(metric, v, target, n)})
            d = hs - timedelta(days=1)
        out["history"] = list(reversed(hist))
    return out


# ---------- suggestions ----------

def suggestions(answers: list[Answer], sessions: list[Session], goals: list[dict], tz: int, today: date) -> list[dict]:
    """What to practise next, most important first. Each suggestion is a kind and the facts behind it;
    the page turns them into sentences and links."""
    out = []
    for g in goals:
        if g.get("behind") and not g.get("met"):
            out.append({"kind": "goal_behind", "priority": 1, "goal_id": g["id"], "metric": g["metric"], "scope": g["scope"],
                        "target": g["target"], "value": g["value"], "per_day": g["per_day"], "period": g["period"]})
    recent = between(answers, today - timedelta(days=59), today + timedelta(days=1), tz)
    weak = sorted([i for i in by_item(recent, 5) if i["accuracy"] < 0.7], key=lambda i: (i["accuracy"], -i["answers"]))
    for i in weak[:3]:
        out.append({"kind": "weak_item", "priority": 2, **i})
    trends = exercise_trends(answers, tz, today)
    for t in trends:
        if t["recent_answers"] >= 10 and t["before_answers"] >= 10 and t["recent"] is not None and t["before"] is not None:
            if t["recent"] <= t["before"] - 0.15:
                out.append({"kind": "slipping", "priority": 2, "exercise": t["exercise"], "before": t["before"], "recent": t["recent"]})
            elif t["recent"] >= t["before"] + 0.10:
                out.append({"kind": "improving", "priority": 6, "exercise": t["exercise"], "before": t["before"], "recent": t["recent"]})
    stale = sorted([t for t in trends if t["answers"] >= 10 and t["days_since"] >= 7], key=lambda t: -t["days_since"])
    for t in stale[:2]:
        out.append({"kind": "stale", "priority": 3, "exercise": t["exercise"], "days_since": t["days_since"]})
    last7 = active_days(between(answers, today - timedelta(days=6), today + timedelta(days=1), tz),
                        between(sessions, today - timedelta(days=6), today + timedelta(days=1), tz), tz)
    if (answers or sessions) and len(last7) < 3:
        out.append({"kind": "few_days", "priority": 3, "days": len(last7)})
    tried = {a.exercise for a in answers}
    for ex in [e for e in EXERCISES if e not in tried][:2]:
        out.append({"kind": "untried", "priority": 4, "exercise": ex})
    if not goals:
        out.append({"kind": "no_goals", "priority": 5})
    return sorted(out, key=lambda x: x["priority"])[:8]
