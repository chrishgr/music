"""Backend for "CAGED Ear Trainer".

Stores profiles, every practice attempt, practice sessions and goals in a single SQLite file, and serves
the front end (index.html and the static folder) on the same address so the microphone works on localhost.
The statistics, points and goal progress are computed in stats.py.

Run:
    pip install -r requirements.txt
    uvicorn app:app --reload
Then open http://localhost:8000 (API documentation at http://localhost:8000/docs).
"""
from __future__ import annotations

import os
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator, model_validator

import stats

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = Path(os.environ.get("GEHOR_DB", BASE_DIR / "gehor.db"))

# The score is never stored. It is computed from the attempts, so new statistics can be
# added later without changing the data that is already saved.
SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    created_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id          INTEGER PRIMARY KEY,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    exercise    TEXT    NOT NULL,
    item        TEXT    NOT NULL,           -- what was asked, e.g. "Minor third" or "Minor, 1st inversion"
    answer      TEXT,                       -- what the user answered, when there is a discrete answer
    correct     INTEGER NOT NULL CHECK (correct IN (0, 1)),
    cents       REAL,                       -- deviation in cents for the tuner exercises
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_profile ON attempts (profile_id, exercise, created_at);

-- Practice without right or wrong answers: the metronome, its exercises, play-along and One minute changes
CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    activity    TEXT    NOT NULL,           -- metronome, drill, progressions or changes
    detail      TEXT,                       -- the exercise, the progression or the pair of chords
    seconds     INTEGER NOT NULL,
    bpm         INTEGER,                    -- the tempo at the end
    value       INTEGER,                    -- a count, such as chord changes in one minute
    created_at  TEXT    NOT NULL            -- when the session ended
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions (profile_id, created_at);

CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY,
    profile_id  INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    metric      TEXT    NOT NULL,           -- points, answers, correct, accuracy, minutes, days, tempo or changes
    scope       TEXT,                       -- an exercise, an activity, a metronome exercise or a pair of chords; NULL for all
    target      REAL    NOT NULL,
    period      TEXT    NOT NULL,           -- day, week or month (starts again every period) or until (long-term)
    due         TEXT,                       -- the last day of a long-term goal
    note        TEXT,
    created_at  TEXT    NOT NULL
);
"""

Exercise = Literal["interval", "chord", "triad_play", "triad_recognize", "caged_play", "caged_recognize", "tuner_hit", "tuner_guess"]
Activity = Literal["metronome", "drill", "progressions", "changes"]
Metric = Literal["points", "answers", "correct", "accuracy", "minutes", "days", "tempo", "changes"]
Period = Literal["day", "week", "month", "until"]
# The browser's offset from UTC in minutes, so days start at local midnight
Tz = Query(default=0, ge=-720, le=840)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def now_utc() -> str:
    return utc_now().isoformat(timespec="seconds")


def local_today(tz: int) -> date:
    return stats.local_day(utc_now(), tz)


# ---------- request and response models ----------

class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)

    @field_validator("name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("The name cannot be empty.")
        return v


class AttemptIn(BaseModel):
    profile_id: int
    exercise: Exercise
    item: str = Field(min_length=1, max_length=80)
    answer: Optional[str] = Field(default=None, max_length=80)
    correct: bool
    cents: Optional[float] = Field(default=None, ge=-2400, le=2400)


class SessionIn(BaseModel):
    profile_id: int
    activity: Activity
    detail: Optional[str] = Field(default=None, max_length=80)
    seconds: int = Field(ge=1, le=4 * 3600)
    bpm: Optional[int] = Field(default=None, ge=20, le=400)
    value: Optional[int] = Field(default=None, ge=0, le=1000)


class GoalIn(BaseModel):
    metric: Metric
    scope: Optional[str] = Field(default=None, max_length=80)
    target: float = Field(gt=0, le=100000)
    period: Period
    due: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def check(self):
        if self.scope is not None and not self.scope.strip():
            self.scope = None
        if self.period == "until" and self.due is None:
            raise ValueError("A long-term goal needs a last day.")
        if self.period != "until":
            self.due = None
        if self.metric == "accuracy" and self.target > 100:
            raise ValueError("Accuracy is at most 100 %.")
        if self.metric == "days":
            if self.period == "day":
                raise ValueError("A goal for practice days needs a week, a month or a long-term period.")
            if self.period in ("week", "month") and self.target > {"week": 7, "month": 31}[self.period]:
                raise ValueError("There are not that many days in the period.")
        if self.metric in ("points", "answers", "correct", "accuracy") and self.scope and self.scope not in stats.EXERCISES:
            raise ValueError("This kind of goal can only be about one exercise with answers.")
        if self.metric in ("minutes", "days") and self.scope and self.scope not in stats.EXERCISES + stats.ACTIVITIES:
            raise ValueError("Unknown exercise or activity.")
        return self


class ProfileOut(BaseModel):
    id: int
    name: str
    created_at: str
    attempts: int
    correct: int
    accuracy: Optional[float]
    score: int = 0


class BoardRow(ProfileOut):
    minutes: float = 0
    active_days: int = 0


# ---------- database helpers ----------

def connect(path: Path) -> sqlite3.Connection:
    # FastAPI may open the connection in one worker thread and run the endpoint in another.
    # Each request still has its own connection and uses it one step at a time, so this is safe.
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")  # SQLite leaves this off unless asked, and ON DELETE CASCADE needs it
    return conn


def accuracy(correct: int, attempts: int) -> Optional[float]:
    return round(correct / attempts, 3) if attempts else None


def streaks(results: list[int]) -> tuple[int, int]:
    """Current and best run of correct answers, given results in chronological order."""
    best = run = 0
    for r in results:
        run = run + 1 if r else 0
        best = max(best, run)
    return run, best


# ---------- application ----------

def create_app(db_path: Path = DEFAULT_DB) -> FastAPI:
    app = FastAPI(title="CAGED Ear Trainer", version="1.0")

    # The browser must check for a newer page and scripts on every load (a quick 304 when nothing changed),
    # otherwise it can keep showing an old version of the app for hours after an update.
    @app.middleware("http")
    async def always_revalidate(request, call_next):
        response = await call_next(request)
        if not request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    with connect(db_path) as conn:
        conn.executescript(SCHEMA)

    def get_db() -> Iterator[sqlite3.Connection]:
        conn = connect(db_path)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def profile_or_404(db: sqlite3.Connection, profile_id: int) -> sqlite3.Row:
        row = db.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Profile not found.")
        return row

    PROFILE_TOTALS = """
        SELECT p.id, p.name, p.created_at,
               COUNT(a.id)                AS attempts,
               COALESCE(SUM(a.correct), 0) AS correct
        FROM profiles p
        LEFT JOIN attempts a ON a.profile_id = p.id {extra_join}
        {where}
        GROUP BY p.id
    """

    def profile_out(row: sqlite3.Row) -> dict:
        return {**dict(row), "accuracy": accuracy(row["correct"], row["attempts"])}

    def load_answers(db: sqlite3.Connection, profile_id: int) -> list[stats.Answer]:
        return [stats.Answer(stats.parse_time(r["created_at"]), r["exercise"], r["item"], bool(r["correct"])) for r in db.execute(
            "SELECT exercise, item, correct, created_at FROM attempts WHERE profile_id = ? ORDER BY created_at, id", (profile_id,))]

    def load_sessions(db: sqlite3.Connection, profile_id: int) -> list[stats.Session]:
        return [stats.Session(stats.parse_time(r["created_at"]), r["activity"], r["detail"], r["seconds"], r["bpm"], r["value"]) for r in db.execute(
            "SELECT * FROM sessions WHERE profile_id = ? ORDER BY created_at, id", (profile_id,))]

    def load_goals(db: sqlite3.Connection, profile_id: int) -> list[dict]:
        return [dict(r) for r in db.execute("SELECT * FROM goals WHERE profile_id = ? ORDER BY created_at, id", (profile_id,))]

    def board(db: sqlite3.Connection, period: str, exercise: Optional[str], tz: int) -> list[dict]:
        """Every profile with its points in this week, this month or all time, best first."""
        today = local_today(tz)
        start, end = stats.period_bounds(period, today) if period != "all" else (date.min, date.max)
        rows = []
        for p in db.execute("SELECT id, name, created_at FROM profiles"):
            answers = stats.between(load_answers(db, p["id"]), start, end, tz)
            sessions = stats.between(load_sessions(db, p["id"]), start, end, tz)
            if exercise:
                answers, sessions = [a for a in answers if a.exercise == exercise], []
            t = stats.totals(answers, sessions, tz)
            rows.append({**dict(p), "attempts": t["answers"], "correct": t["correct"], "accuracy": t["accuracy"],
                         "score": stats.score(answers, sessions, tz, exercise)["total"],
                         "minutes": t["minutes"], "active_days": t["active_days"]})
        return sorted(rows, key=lambda r: (-r["score"], -(r["accuracy"] or 0), r["attempts"], r["name"].lower()))

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/scoring")
    def scoring() -> dict:
        """The rules of the points system, so the page can explain them without a copy of the numbers."""
        return {"answer_points": stats.ANSWER_POINTS, "streak_every": stats.STREAK_EVERY, "streak_bonus": stats.STREAK_BONUS,
                "practice_points_per_day": stats.PRACTICE_POINTS_PER_DAY, "day_bonus": stats.DAY_BONUS,
                "min_accuracy_answers": stats.MIN_ACCURACY_ANSWERS}

    @app.get("/api/profiles", response_model=list[ProfileOut])
    def list_profiles(tz: int = Tz, db: sqlite3.Connection = Depends(get_db)):
        rows = db.execute(PROFILE_TOTALS.format(extra_join="", where="") + " ORDER BY p.name").fetchall()
        return [{**profile_out(r), "score": stats.score(load_answers(db, r["id"]), load_sessions(db, r["id"]), tz)["total"]} for r in rows]

    @app.post("/api/profiles", response_model=ProfileOut, status_code=201)
    def create_profile(body: ProfileIn, db: sqlite3.Connection = Depends(get_db)):
        try:
            cur = db.execute("INSERT INTO profiles (name, created_at) VALUES (?, ?)", (body.name, now_utc()))
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="A profile with that name already exists.")
        row = db.execute(PROFILE_TOTALS.format(extra_join="", where="WHERE p.id = ?"), (cur.lastrowid,)).fetchone()
        return profile_out(row)

    @app.delete("/api/profiles/{profile_id}", status_code=204)
    def delete_profile(profile_id: int, db: sqlite3.Connection = Depends(get_db)):
        profile_or_404(db, profile_id)
        db.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))  # attempts follow through ON DELETE CASCADE
        return Response(status_code=204)

    @app.post("/api/attempts", status_code=201)
    def add_attempt(body: AttemptIn, db: sqlite3.Connection = Depends(get_db)):
        profile_or_404(db, body.profile_id)
        cur = db.execute(
            "INSERT INTO attempts (profile_id, exercise, item, answer, correct, cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (body.profile_id, body.exercise, body.item, body.answer, int(body.correct), body.cents, now_utc()),
        )
        return {"id": cur.lastrowid}

    @app.post("/api/sessions", status_code=201)
    def add_session(body: SessionIn, db: sqlite3.Connection = Depends(get_db)):
        profile_or_404(db, body.profile_id)
        cur = db.execute(
            "INSERT INTO sessions (profile_id, activity, detail, seconds, bpm, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (body.profile_id, body.activity, body.detail, body.seconds, body.bpm, body.value, now_utc()),
        )
        return {"id": cur.lastrowid}

    @app.get("/api/profiles/{profile_id}/overview")
    def profile_overview(profile_id: int, tz: int = Tz, weeks: int = Query(default=12, ge=1, le=52),
                         db: sqlite3.Connection = Depends(get_db)):
        """Everything for the profile page: totals, points, streaks, progress per week, accuracy per
        exercise with its trend, suggestions and the place on this week's and this month's leaderboard."""
        profile = profile_or_404(db, profile_id)
        today = local_today(tz)
        answers, sessions = load_answers(db, profile_id), load_sessions(db, profile_id)
        goals = [stats.goal_progress(g, answers, sessions, tz, today) for g in load_goals(db, profile_id)]
        current, best = stats.streaks(answers)

        def window(kind: str) -> dict:
            start, end = stats.period_bounds(kind, today)
            return stats.totals(stats.between(answers, start, end, tz), stats.between(sessions, start, end, tz), tz)

        def before(kind: str) -> dict:
            start, _ = stats.period_bounds(kind, today)
            pstart, pend, _ = stats.compare_period(kind, start, today)
            return {"start": pstart.isoformat(), "end": (pend - timedelta(days=1)).isoformat(),
                    **stats.totals(stats.between(answers, pstart, pend, tz), stats.between(sessions, pstart, pend, tz), tz)}

        def rank(period: str) -> dict:
            rows = board(db, period, None, tz)
            return {"rank": next(i + 1 for i, r in enumerate(rows) if r["id"] == profile_id), "of": len(rows)}

        return {
            "profile": {"id": profile["id"], "name": profile["name"], "created_at": profile["created_at"]},
            "today": today.isoformat(),
            "totals": stats.totals(answers, sessions, tz),
            "score": stats.score(answers, sessions, tz),
            "streak": {"current": current, "best": best},
            "practice_streak": stats.practice_streak(answers, sessions, tz, today),
            "periods": {"day": window("day"), "week": window("week"), "month": window("month")},
            "same_days_before": {"week": before("week"), "month": before("month")},
            "progress": stats.progress(answers, sessions, tz, today, weeks),
            "exercises": stats.exercise_trends(answers, tz, today),
            "suggestions": stats.suggestions(answers, sessions, goals, tz, today),
            "rank": {"week": rank("week"), "month": rank("month")},
        }

    @app.get("/api/profiles/{profile_id}/summary")
    def profile_summary(profile_id: int, period: Literal["day", "week", "month"] = "week", day: Optional[date] = None,
                        tz: int = Tz, db: sqlite3.Connection = Depends(get_db)):
        """The day, week or month that contains `day` (today when left out), compared with the one before."""
        profile_or_404(db, profile_id)
        answers, sessions = load_answers(db, profile_id), load_sessions(db, profile_id)
        result = stats.summary(answers, sessions, period, day or local_today(tz), tz, local_today(tz))
        start, end = date.fromisoformat(result["period"]["start"]), date.fromisoformat(result["period"]["end"])
        result["goals_met"] = [g for g in (stats.goal_progress(g, answers, sessions, tz, min(end, local_today(tz)))
                                           for g in load_goals(db, profile_id) if g["period"] == period) if g["met"]]
        return result

    @app.get("/api/profiles/{profile_id}/goals")
    def list_goals(profile_id: int, tz: int = Tz, db: sqlite3.Connection = Depends(get_db)):
        profile_or_404(db, profile_id)
        today = local_today(tz)
        answers, sessions = load_answers(db, profile_id), load_sessions(db, profile_id)
        return [stats.goal_progress(g, answers, sessions, tz, today) for g in load_goals(db, profile_id)]

    @app.post("/api/profiles/{profile_id}/goals", status_code=201)
    def add_goal(profile_id: int, body: GoalIn, tz: int = Tz, db: sqlite3.Connection = Depends(get_db)):
        profile_or_404(db, profile_id)
        if body.due and body.due < local_today(tz):
            raise HTTPException(status_code=422, detail="The last day of the goal has already passed.")
        cur = db.execute(
            "INSERT INTO goals (profile_id, metric, scope, target, period, due, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (profile_id, body.metric, body.scope, body.target, body.period, body.due.isoformat() if body.due else None, body.note, now_utc()),
        )
        goal = dict(db.execute("SELECT * FROM goals WHERE id = ?", (cur.lastrowid,)).fetchone())
        return stats.goal_progress(goal, load_answers(db, profile_id), load_sessions(db, profile_id), tz, local_today(tz))

    @app.delete("/api/goals/{goal_id}", status_code=204)
    def delete_goal(goal_id: int, db: sqlite3.Connection = Depends(get_db)):
        if db.execute("DELETE FROM goals WHERE id = ?", (goal_id,)).rowcount == 0:
            raise HTTPException(status_code=404, detail="Goal not found.")
        return Response(status_code=204)

    @app.get("/api/profiles/{profile_id}/stats")
    def profile_stats(profile_id: int, days: int = 14, db: sqlite3.Connection = Depends(get_db)):
        profile = profile_or_404(db, profile_id)
        results = [r[0] for r in db.execute(
            "SELECT correct FROM attempts WHERE profile_id = ? ORDER BY created_at, id", (profile_id,))]
        current, best = streaks(results)

        exercises = [
            {**dict(r), "accuracy": accuracy(r["correct"], r["attempts"])}
            for r in db.execute(
                """SELECT exercise, COUNT(*) AS attempts, SUM(correct) AS correct
                   FROM attempts WHERE profile_id = ? GROUP BY exercise ORDER BY exercise""", (profile_id,))
        ]
        # Items with at least three attempts, weakest first, so a single unlucky answer does not dominate
        weakest = [
            {**dict(r), "accuracy": accuracy(r["correct"], r["attempts"])}
            for r in db.execute(
                """SELECT exercise, item, COUNT(*) AS attempts, SUM(correct) AS correct
                   FROM attempts WHERE profile_id = ?
                   GROUP BY exercise, item HAVING COUNT(*) >= 3
                   ORDER BY CAST(SUM(correct) AS REAL) / COUNT(*), COUNT(*) DESC
                   LIMIT 8""", (profile_id,))
        ]
        since = (datetime.now(timezone.utc) - timedelta(days=days - 1)).date().isoformat()
        per_day = [
            dict(r) for r in db.execute(
                """SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS attempts, SUM(correct) AS correct
                   FROM attempts WHERE profile_id = ? AND substr(created_at, 1, 10) >= ?
                   GROUP BY day ORDER BY day""", (profile_id, since))
        ]
        total, correct = len(results), sum(results)
        return {
            "profile": {"id": profile["id"], "name": profile["name"], "created_at": profile["created_at"]},
            "totals": {"attempts": total, "correct": correct, "accuracy": accuracy(correct, total)},
            "current_streak": current,
            "best_streak": best,
            "exercises": exercises,
            "weakest": weakest,
            "days": per_day,
        }

    @app.get("/api/leaderboard", response_model=list[BoardRow])
    def leaderboard(exercise: Optional[Exercise] = None, period: Literal["all", "week", "month"] = "all",
                    tz: int = Tz, db: sqlite3.Connection = Depends(get_db)):
        """Profiles ranked by points (see stats.py), for all time, this week or this month, optionally one exercise."""
        return board(db, period, exercise, tz)

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(BASE_DIR / "index.html")

    # Style sheet and scripts of the front end
    app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

    return app


app = create_app()
