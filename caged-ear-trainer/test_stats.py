"""Tests for stats.py: periods, points, practice time, summaries, goals and suggestions.
Run with:  pytest -q

The expected values are worked out by hand from the rules at the top of stats.py.
"""
from datetime import date, datetime, timedelta, timezone

import stats
from stats import Answer, Session

T0 = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)      # a Wednesday, 12:00 UTC
TODAY = date(2026, 10, 7)


def ans(minutes_ago=0, exercise="interval", item="Minor third", correct=True, days_ago=0):
    return Answer(T0 - timedelta(days=days_ago, minutes=minutes_ago), exercise, item, correct)


def ses(days_ago=0, activity="metronome", seconds=600, detail=None, bpm=None, value=None):
    return Session(T0 - timedelta(days=days_ago), activity, detail, seconds, bpm, value)


# ---------- periods ----------

def test_period_bounds():
    assert stats.period_bounds("day", TODAY) == (date(2026, 10, 7), date(2026, 10, 8))
    assert stats.period_bounds("week", TODAY) == (date(2026, 10, 5), date(2026, 10, 12))      # Monday to Monday
    assert stats.period_bounds("week", date(2026, 10, 11)) == (date(2026, 10, 5), date(2026, 10, 12))   # Sunday
    assert stats.period_bounds("month", TODAY) == (date(2026, 10, 1), date(2026, 11, 1))
    assert stats.period_bounds("month", date(2026, 12, 31)) == (date(2026, 12, 1), date(2027, 1, 1))
    assert stats.period_bounds("month", date(2028, 2, 10)) == (date(2028, 2, 1), date(2028, 3, 1))
    assert stats.previous_period("month", date(2026, 1, 1)) == (date(2025, 12, 1), date(2026, 1, 1))
    assert stats.previous_period("week", date(2026, 10, 5)) == (date(2026, 9, 28), date(2026, 10, 5))


def test_local_day_uses_the_offset():
    late = datetime(2026, 10, 4, 23, 30, tzinfo=timezone.utc)
    assert stats.local_day(late, 0) == date(2026, 10, 4)
    assert stats.local_day(late, 120) == date(2026, 10, 5)       # Oslo in summer, UTC+2
    assert stats.local_day(late, -300) == date(2026, 10, 4)


# ---------- points and time ----------

def test_answer_seconds():
    # answers at 0 s, 30 s and 60 s, then one after a ten-minute pause: 10 + 30 + 30 + 10
    rows = [ans(minutes_ago=11), ans(minutes_ago=10.5), ans(minutes_ago=10), ans(minutes_ago=0)]
    assert stats.answer_seconds(rows) == 80
    assert stats.answer_seconds([]) == 0


def test_streak_bonus():
    ten = [ans(minutes_ago=30 - i) for i in range(10)]
    assert stats.streak_bonus(ten) == 5
    broken = [ans(minutes_ago=40 - i) for i in range(9)] + [ans(minutes_ago=30, correct=False)] + [ans(minutes_ago=20 - i) for i in range(10)]
    assert stats.streak_bonus(broken) == 5
    assert stats.streak_bonus([ans(minutes_ago=30 - i) for i in range(20)]) == 10


def test_score_parts():
    answers = [ans(minutes_ago=5), ans(minutes_ago=4), ans(minutes_ago=3),                    # 3 x 1 point
               ans(minutes_ago=2, exercise="caged_play"), ans(minutes_ago=1, exercise="caged_play"),   # 2 x 2 points
               ans(minutes_ago=0, correct=False)]                                              # nothing
    sessions = [ses(days_ago=0, seconds=45 * 60),          # 45 minutes today, capped at 30 points
                ses(days_ago=1, seconds=10 * 60 + 59)]     # 10 whole minutes yesterday
    s = stats.score(answers, sessions, 0)
    assert s["answers"] == 7
    assert s["streaks"] == 0
    assert s["practice"] == 30 + 10
    assert s["days"] == 2 * stats.DAY_BONUS                # today and yesterday
    assert s["total"] == 7 + 0 + 40 + 10
    only = stats.score(answers, sessions, 0, exercise="caged_play")
    assert only == {"answers": 4, "streaks": 0, "practice": 0, "days": 0, "total": 4}


def test_totals_and_practice_streak():
    answers = [ans(minutes_ago=1), ans(minutes_ago=0, correct=False), ans(days_ago=1), ans(days_ago=2), ans(days_ago=5)]
    sessions = [ses(days_ago=3, seconds=120)]
    t = stats.totals(answers, sessions, 0)
    assert (t["answers"], t["correct"], t["accuracy"], t["active_days"]) == (5, 4, 0.8, 5)
    # 10 + 60 seconds today, 10 on each of the three other days, 120 s of metronome
    assert t["minutes"] == round((70 + 30 + 120) / 60, 1)
    assert stats.practice_streak(answers, sessions, 0, TODAY) == 4          # today and the three days before
    assert stats.practice_streak(answers[2:], sessions, 0, TODAY) == 3      # nothing today yet: counts from yesterday
    assert stats.practice_streak([], [], 0, TODAY) == 0


# ---------- summaries and progress ----------

def test_week_summary_compares_with_the_week_before():
    answers = ([ans(days_ago=0, item="Tritone", correct=c) for c in (True, False, False)] +   # this week, Wednesday
               [ans(days_ago=1, item="Octave") for _ in range(3)] +                            # this week, Tuesday
               [ans(days_ago=8, item="Octave")])                                               # last week
    sessions = [ses(days_ago=2, activity="drill", detail="Speed trainer", seconds=300, bpm=120),
                ses(days_ago=2, activity="drill", detail="Speed trainer", seconds=300, bpm=135)]
    s = stats.summary(answers, sessions, "week", TODAY, 0)
    assert s["period"] == {"kind": "week", "start": "2026-10-05", "end": "2026-10-11"}
    assert (s["totals"]["answers"], s["totals"]["correct"], s["totals"]["active_days"]) == (6, 4, 3)
    assert (s["previous"]["start"], s["previous"]["answers"]) == ("2026-09-28", 1)
    assert [d["date"] for d in s["days"]] == [f"2026-10-{d:02d}" for d in range(5, 12)]
    assert [d["answers"] for d in s["days"]] == [0, 3, 3, 0, 0, 0, 0]      # Tuesday and Wednesday
    assert [i["item"] for i in s["weakest"]] == ["Tritone"]
    assert [i["item"] for i in s["best"]] == ["Octave"]
    assert s["sessions"] == [{"activity": "drill", "detail": "Speed trainer", "count": 2, "minutes": 10.0, "best_bpm": 135, "best_value": None}]


def test_month_and_day_summaries():
    answers = [ans(days_ago=0), ans(days_ago=6), ans(days_ago=7)]     # 7 Oct, 1 Oct, 30 Sep
    month = stats.summary(answers, [], "month", TODAY, 0)
    assert (month["period"]["start"], month["period"]["end"], month["totals"]["answers"]) == ("2026-10-01", "2026-10-31", 2)
    assert (month["previous"]["start"], month["previous"]["answers"]) == ("2026-09-01", 1)
    assert len(month["days"]) == 31
    day = stats.summary(answers, [], "day", TODAY, 0)
    assert (day["totals"]["answers"], day["days"]) == (1, [])


def test_running_periods_compare_with_the_same_days_before():
    # Wednesday 7 October: this week has run three days and this month seven
    assert stats.compare_period("week", date(2026, 10, 5), TODAY) == (date(2026, 9, 28), date(2026, 10, 1), True)
    assert stats.compare_period("month", date(2026, 10, 1), TODAY) == (date(2026, 9, 1), date(2026, 9, 8), True)
    # finished periods and days compare with the whole period before
    assert stats.compare_period("week", date(2026, 9, 28), TODAY) == (date(2026, 9, 21), date(2026, 9, 28), False)
    assert stats.compare_period("day", TODAY, TODAY) == (date(2026, 10, 6), TODAY, False)
    # on 31 March the month before has only 28 days, so all of February counts
    assert stats.compare_period("month", date(2027, 3, 1), date(2027, 3, 31)) == (date(2027, 2, 1), date(2027, 3, 1), False)
    assert stats.compare_period("month", date(2027, 3, 1), date(2027, 3, 30)) == (date(2027, 2, 1), date(2027, 3, 1), True)
    answers = [ans(days_ago=0), ans(days_ago=8), ans(days_ago=10), ans(days_ago=32)]   # 7 Oct, 29 Sep, 27 Sep, 5 Sep
    week = stats.summary(answers, [], "week", TODAY, 0, TODAY)
    assert (week["previous"]["start"], week["previous"]["end"], week["previous"]["partial"], week["previous"]["answers"]) == ("2026-09-28", "2026-09-30", True, 1)
    month = stats.summary(answers, [], "month", TODAY, 0, TODAY)
    assert (month["previous"]["end"], month["previous"]["answers"]) == ("2026-09-07", 1)
    assert stats.summary(answers, [], "month", TODAY, 0)["previous"]["answers"] == 3   # without today: the whole month


def test_progress_has_one_row_per_week():
    answers = [ans(days_ago=0), ans(days_ago=0, exercise="chord", correct=False), ans(days_ago=14)]
    rows = stats.progress(answers, [], 0, TODAY, weeks=3)
    assert [r["start"] for r in rows] == ["2026-09-21", "2026-09-28", "2026-10-05"]
    assert [r["answers"] for r in rows] == [1, 0, 2]
    assert rows[-1]["exercises"] == {"interval": 1.0, "chord": 0.0}


# ---------- goals ----------

def goal(metric, target, period, scope=None, due=None, created=T0 - timedelta(days=2)):
    return {"id": 1, "metric": metric, "scope": scope, "target": target, "period": period, "due": due, "note": None,
            "created_at": created.isoformat()}


def test_weekly_points_goal():
    answers = [ans(days_ago=1, minutes_ago=i) for i in range(4)]     # Tuesday: 4 points + 5 for the day
    g = stats.goal_progress(goal("points", 50, "week"), answers, [], 0, TODAY)
    assert (g["value"], g["met"], g["start"], g["end"], g["days_left"]) == (9, False, "2026-10-05", "2026-10-11", 5)
    assert g["per_day"] == round((50 - 9) / 5, 1)
    assert g["behind"] is True          # on Wednesday, 3 of 7 days: 80 % of 3/7 of 50 is 17.1, and 9 is less
    assert len(g["history"]) == 6 and g["history"][-1]["start"] == "2026-10-05"


def test_goal_behind_and_met():
    g = stats.goal_progress(goal("answers", 70, "week"), [ans(days_ago=1)], [], 0, TODAY)
    assert g["behind"] is True          # 1 answer, while 0.8 * 70 * 3/7 = 24 would be on track
    done = stats.goal_progress(goal("answers", 2, "day"), [ans(minutes_ago=1), ans()], [], 0, TODAY)
    assert (done["met"], done["per_day"], done["fraction"]) == (True, None, 1.0)


def test_accuracy_goal_needs_ten_answers():
    nine = [ans(minutes_ago=i) for i in range(9)]
    assert stats.goal_progress(goal("accuracy", 80, "day"), nine, [], 0, TODAY)["met"] is False
    ten = nine + [ans(minutes_ago=20, correct=False)]
    g = stats.goal_progress(goal("accuracy", 80, "day"), ten, [], 0, TODAY)
    assert (g["value"], g["met"]) == (90.0, True)
    scoped = stats.goal_progress(goal("accuracy", 80, "day", scope="chord"), ten, [], 0, TODAY)
    assert (scoped["value"], scoped["met"]) == (None, False)


def test_long_term_tempo_and_changes_goals():
    sessions = [ses(days_ago=1, activity="drill", detail="Spider (1-2-3-4)", bpm=96),
                ses(days_ago=1, activity="drill", detail="Speed trainer", bpm=140),
                ses(days_ago=0, activity="changes", detail="A–D", seconds=60, value=34),
                ses(days_ago=5, activity="changes", detail="A–D", seconds=60, value=50)]   # before the goal was set
    spider = stats.goal_progress(goal("tempo", 120, "until", scope="Spider (1-2-3-4)", due="2026-12-31"), [], sessions, 0, TODAY)
    assert (spider["value"], spider["met"], spider["days_left"], spider["expired"]) == (96, False, 86, False)
    assert "history" not in spider
    anything = stats.goal_progress(goal("tempo", 120, "until", due="2026-12-31"), [], sessions, 0, TODAY)
    assert (anything["value"], anything["met"]) == (140, True)
    changes = stats.goal_progress(goal("changes", 40, "until", scope="A–D", due="2026-11-01"), [], sessions, 0, TODAY)
    assert changes["value"] == 34       # the 50 came before the goal
    late = stats.goal_progress(goal("changes", 40, "until", scope="A–D", due="2026-10-06"), [], sessions, 0, TODAY)
    assert (late["expired"], late["days_left"]) == (True, 0)


def test_minutes_goal_by_activity_and_exercise():
    answers = [ans(minutes_ago=1), ans()]                                   # 10 + 60 seconds
    sessions = [ses(activity="progressions", seconds=600), ses(activity="metronome", seconds=300)]
    all_ = stats.goal_progress(goal("minutes", 30, "day"), answers, sessions, 0, TODAY)
    assert all_["value"] == round((70 + 900) / 60, 1)
    assert stats.goal_progress(goal("minutes", 30, "day", scope="progressions"), answers, sessions, 0, TODAY)["value"] == 10.0
    assert stats.goal_progress(goal("minutes", 30, "day", scope="interval"), answers, sessions, 0, TODAY)["value"] == round(70 / 60, 1)


# ---------- suggestions ----------

def test_suggestions():
    answers = ([ans(days_ago=1, item="Minor sixth", correct=i < 2, minutes_ago=i) for i in range(5)] +      # 40 %
               [ans(days_ago=10, exercise="chord", item="Major", minutes_ago=i) for i in range(10)])         # not for 10 days
    kinds = [s["kind"] for s in stats.suggestions(answers, [], [], 0, TODAY)]
    assert kinds[0] == "weak_item"
    assert "stale" in kinds and "untried" in kinds and "few_days" in kinds and "no_goals" in kinds
    weak = next(s for s in stats.suggestions(answers, [], [], 0, TODAY) if s["kind"] == "weak_item")
    assert (weak["item"], weak["answers"], weak["accuracy"]) == ("Minor sixth", 5, 0.4)
    behind = stats.goal_progress(goal("answers", 500, "week"), answers, [], 0, TODAY)
    first = stats.suggestions(answers, [], [behind], 0, TODAY)[0]
    assert first["kind"] == "goal_behind" and first["per_day"] == round((500 - 5) / 5, 1)


def test_slipping_and_improving():
    before = [ans(days_ago=20, minutes_ago=i) for i in range(10)]                     # 100 %
    recent = [ans(days_ago=2, minutes_ago=i, correct=i < 5) for i in range(10)]       # 50 %
    kinds = {s["kind"] for s in stats.suggestions(before + recent, [], [], 0, TODAY)}
    assert "slipping" in kinds
    worse = [ans(days_ago=20, minutes_ago=i, correct=i < 5) for i in range(10)]
    better = [ans(days_ago=2, minutes_ago=i) for i in range(10)]
    assert "improving" in {s["kind"] for s in stats.suggestions(worse + better, [], [], 0, TODAY)}
