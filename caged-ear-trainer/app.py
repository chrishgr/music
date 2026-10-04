"""Backend for "CAGED Ear Trainer".

Stores profiles and every practice attempt in a single SQLite file, and serves the
front end (index.html and the static folder) on the same address so the microphone works on localhost.

Run:
    pip install -r requirements.txt
    uvicorn app:app --reload
Then open http://localhost:8000 (API documentation at http://localhost:8000/docs).
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator, Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

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
"""

Exercise = Literal["interval", "chord", "triad_play", "triad_recognize", "caged_play", "caged_recognize", "tuner_hit", "tuner_guess"]


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


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


class ProfileOut(BaseModel):
    id: int
    name: str
    created_at: str
    attempts: int
    correct: int
    accuracy: Optional[float]


# ---------- database helpers ----------

def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
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

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    @app.get("/api/profiles", response_model=list[ProfileOut])
    def list_profiles(db: sqlite3.Connection = Depends(get_db)):
        rows = db.execute(PROFILE_TOTALS.format(extra_join="", where="") + " ORDER BY p.name").fetchall()
        return [profile_out(r) for r in rows]

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

    @app.get("/api/leaderboard", response_model=list[ProfileOut])
    def leaderboard(exercise: Optional[Exercise] = None, db: sqlite3.Connection = Depends(get_db)):
        if exercise:
            sql = PROFILE_TOTALS.format(extra_join="AND a.exercise = ?", where="")
            rows = db.execute(sql + " ORDER BY correct DESC, attempts ASC, p.name", (exercise,)).fetchall()
        else:
            sql = PROFILE_TOTALS.format(extra_join="", where="")
            rows = db.execute(sql + " ORDER BY correct DESC, attempts ASC, p.name").fetchall()
        return [profile_out(r) for r in rows]

    @app.get("/", include_in_schema=False)
    def index():
        return FileResponse(BASE_DIR / "index.html")

    # Style sheet and scripts of the front end
    app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

    return app


app = create_app()
