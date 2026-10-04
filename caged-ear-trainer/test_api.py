"""Tests for the backend. Run with:  pytest -q

Every test gets its own empty database in a temporary folder.
"""
import threading

import pytest
from fastapi.testclient import TestClient

from app import connect, create_app, streaks


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(tmp_path / "test.db"))


def make_profile(client, name="Christian"):
    r = client.post("/api/profiles", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def attempt(client, pid, exercise="interval", item="Minor third", correct=True, **extra):
    r = client.post("/api/attempts", json={"profile_id": pid, "exercise": exercise, "item": item, "correct": correct, **extra})
    assert r.status_code == 201, r.text


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_create_and_list_profiles(client):
    make_profile(client, "Christian")
    make_profile(client, "  Ada   Lovelace ")
    names = [p["name"] for p in client.get("/api/profiles").json()]
    assert names == ["Ada Lovelace", "Christian"]       # sorted, extra spaces removed


def test_duplicate_name_is_rejected_case_insensitive(client):
    make_profile(client, "Christian")
    r = client.post("/api/profiles", json={"name": "christian"})
    assert r.status_code == 409
    assert "already exists" in r.json()["detail"]


@pytest.mark.parametrize("name", ["", "   ", "x" * 41])
def test_invalid_names(client, name):
    assert client.post("/api/profiles", json={"name": name}).status_code == 422


def test_attempts_and_stats(client):
    pid = make_profile(client)
    for ok in [True, True, False, True, True, True]:
        attempt(client, pid, correct=ok)
    attempt(client, pid, exercise="tuner_hit", item="A", correct=True, cents=-4.5)
    stats = client.get(f"/api/profiles/{pid}/stats").json()
    assert stats["totals"] == {"attempts": 7, "correct": 6, "accuracy": round(6 / 7, 3)}
    assert stats["current_streak"] == 4
    assert stats["best_streak"] == 4
    by_ex = {e["exercise"]: e for e in stats["exercises"]}
    assert by_ex["interval"]["attempts"] == 6 and by_ex["interval"]["correct"] == 5
    assert by_ex["tuner_hit"]["correct"] == 1
    assert stats["days"][-1]["attempts"] == 7


def test_weakest_items_need_three_attempts_and_are_sorted(client):
    pid = make_profile(client)
    for ok in [False, False, True]:
        attempt(client, pid, item="Tritone", correct=ok)
    for ok in [True, True, False]:
        attempt(client, pid, item="Perfect fifth", correct=ok)
    attempt(client, pid, item="Octave", correct=False)   # only one attempt, left out
    weakest = client.get(f"/api/profiles/{pid}/stats").json()["weakest"]
    assert [w["item"] for w in weakest] == ["Tritone", "Perfect fifth"]


def test_unknown_exercise_is_rejected(client):
    pid = make_profile(client)
    r = client.post("/api/attempts", json={"profile_id": pid, "exercise": "cheating", "item": "x", "correct": True})
    assert r.status_code == 422


def test_attempt_for_missing_profile(client):
    r = client.post("/api/attempts", json={"profile_id": 999, "exercise": "interval", "item": "x", "correct": True})
    assert r.status_code == 404


def test_leaderboard_order_and_filter(client):
    a, b = make_profile(client, "Anne"), make_profile(client, "Bob")
    for _ in range(3):
        attempt(client, a, correct=True)
    for _ in range(5):
        attempt(client, b, exercise="chord", correct=True)
    assert [p["name"] for p in client.get("/api/leaderboard").json()] == ["Bob", "Anne"]
    only_intervals = client.get("/api/leaderboard", params={"exercise": "interval"}).json()
    assert [(p["name"], p["correct"]) for p in only_intervals] == [("Anne", 3), ("Bob", 0)]


def test_delete_profile_removes_its_attempts(client, tmp_path):
    pid = make_profile(client)
    attempt(client, pid)
    assert client.delete(f"/api/profiles/{pid}").status_code == 204
    assert client.get(f"/api/profiles/{pid}/stats").status_code == 404
    import sqlite3
    left = sqlite3.connect(tmp_path / "test.db").execute("SELECT COUNT(*) FROM attempts").fetchone()[0]
    assert left == 0


def test_index_is_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "<title>Fretboard &amp; Keys</title>" in r.text


def test_static_files_are_served(client):
    for path in ["static/theory.js", "static/ui.js", "static/style.css", "static/main.js", "static/pages/caged.js"]:
        assert f'"{path}"' in client.get("/").text, path      # the page links to it
        r = client.get("/" + path)
        assert r.status_code == 200 and len(r.text) > 100, path
    assert client.get("/static/nothing.js").status_code == 404


def test_page_and_scripts_are_always_revalidated(client):
    # after an update the browser must not keep showing the old page from its cache
    for path in ["/", "/static/ui.js", "/static/style.css"]:
        assert client.get(path).headers["cache-control"] == "no-cache", path


def test_caged_exercises_are_accepted(client):
    pid = make_profile(client)
    attempt(client, pid, exercise="caged_play", item="Minor, A shape", correct=True)
    attempt(client, pid, exercise="caged_recognize", item="Dominant 7, E shape", answer="C shape, G7", correct=False)
    by_ex = {e["exercise"]: e for e in client.get(f"/api/profiles/{pid}/stats").json()["exercises"]}
    assert by_ex["caged_play"]["correct"] == 1 and by_ex["caged_recognize"]["correct"] == 0


def test_streaks_helper():
    assert streaks([]) == (0, 0)
    assert streaks([1, 1, 0, 1]) == (1, 2)
    assert streaks([0, 1, 1, 1]) == (3, 3)


# ---------- statistics, goals, summaries and the points leaderboard ----------
import sqlite3
from datetime import datetime, timezone

import app as app_module

NOW = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)      # a Wednesday


@pytest.fixture
def fixed(tmp_path, monkeypatch):
    """A client whose clock stands still on Wednesday 7 October 2026, 12:00 UTC."""
    monkeypatch.setattr(app_module, "utc_now", lambda: NOW)
    return TestClient(create_app(tmp_path / "test.db")), tmp_path / "test.db"


def old_attempt(db_path, pid, when, exercise="interval", item="Minor third", correct=True):
    with sqlite3.connect(db_path) as db:
        db.execute("INSERT INTO attempts (profile_id, exercise, item, correct, created_at) VALUES (?, ?, ?, ?, ?)",
                   (pid, exercise, item, int(correct), when))


def test_sessions_are_saved_and_checked(fixed):
    client, _ = fixed
    pid = make_profile(client)
    ok = {"profile_id": pid, "activity": "drill", "detail": "Speed trainer", "seconds": 300, "bpm": 132}
    assert client.post("/api/sessions", json=ok).status_code == 201
    assert client.post("/api/sessions", json={**ok, "activity": "sleeping"}).status_code == 422
    assert client.post("/api/sessions", json={**ok, "seconds": 0}).status_code == 422
    assert client.post("/api/sessions", json={**ok, "profile_id": 999}).status_code == 404
    week = client.get(f"/api/profiles/{pid}/summary", params={"period": "week"}).json()
    assert week["sessions"][0]["best_bpm"] == 132 and week["totals"]["minutes"] == 5.0


def test_goals_create_list_progress_and_delete(fixed):
    client, _ = fixed
    pid = make_profile(client)
    for _ in range(3):
        attempt(client, pid)
    r = client.post(f"/api/profiles/{pid}/goals", json={"metric": "answers", "target": 3, "period": "day"})
    assert r.status_code == 201 and r.json()["value"] == 3 and r.json()["met"] is True
    long = client.post(f"/api/profiles/{pid}/goals", json={"metric": "tempo", "target": 120, "period": "until",
                                                            "due": "2026-12-31", "scope": "Spider (1-2-3-4)", "note": "Clean at 120"})
    assert long.status_code == 201 and long.json()["days_left"] == 86
    goals = client.get(f"/api/profiles/{pid}/goals").json()
    assert [g["metric"] for g in goals] == ["answers", "tempo"]
    assert client.delete(f"/api/goals/{goals[0]['id']}").status_code == 204
    assert client.delete(f"/api/goals/{goals[0]['id']}").status_code == 404
    assert len(client.get(f"/api/profiles/{pid}/goals").json()) == 1


@pytest.mark.parametrize("bad", [
    {"metric": "points", "target": 10, "period": "until"},                       # no last day
    {"metric": "points", "target": 10, "period": "until", "due": "2026-10-01"},  # last day already passed
    {"metric": "accuracy", "target": 120, "period": "week"},
    {"metric": "days", "target": 1, "period": "day"},
    {"metric": "days", "target": 9, "period": "week"},
    {"metric": "points", "target": 10, "period": "week", "scope": "metronome"},  # points per exercise only
    {"metric": "points", "target": 0, "period": "week"},
    {"metric": "happiness", "target": 1, "period": "week"},
])
def test_invalid_goals(fixed, bad):
    client, _ = fixed
    pid = make_profile(client)
    assert client.post(f"/api/profiles/{pid}/goals", json=bad).status_code == 422


def test_overview(fixed):
    client, db_path = fixed
    pid, other = make_profile(client, "Ada"), make_profile(client, "Bo")
    for _ in range(4):
        attempt(client, pid)
    attempt(client, other, correct=False)
    old_attempt(db_path, pid, "2026-09-20T10:00:00+00:00", exercise="chord", item="Major", correct=False)
    o = client.get(f"/api/profiles/{pid}/overview", params={"tz": 120}).json()
    assert o["today"] == "2026-10-07"
    assert o["totals"]["answers"] == 5
    assert o["periods"]["day"]["answers"] == 4 and o["periods"]["month"]["answers"] == 4
    # this week has run Monday to Wednesday, so it is compared with Monday to Wednesday last week
    assert (o["same_days_before"]["week"]["start"], o["same_days_before"]["week"]["end"]) == ("2026-09-28", "2026-09-30")
    assert (o["same_days_before"]["month"]["end"], o["same_days_before"]["month"]["answers"]) == ("2026-09-07", 0)
    assert o["score"]["answers"] == 4 and o["score"]["days"] == 2 * 5
    assert o["practice_streak"] == 1
    assert len(o["progress"]) == 12 and o["progress"][-1]["start"] == "2026-10-05"
    assert {e["exercise"] for e in o["exercises"]} == {"interval", "chord"}
    assert o["rank"]["week"] == {"rank": 1, "of": 2}
    assert any(s["kind"] == "no_goals" for s in o["suggestions"])


def test_summary_periods_and_previous(fixed):
    client, db_path = fixed
    pid = make_profile(client)
    attempt(client, pid)                                            # 7 October
    old_attempt(db_path, pid, "2026-09-30T10:00:00+00:00")          # last week and last month
    week = client.get(f"/api/profiles/{pid}/summary", params={"period": "week"}).json()
    assert (week["period"]["start"], week["totals"]["answers"], week["previous"]["answers"]) == ("2026-10-05", 1, 1)
    month = client.get(f"/api/profiles/{pid}/summary", params={"period": "month", "day": "2026-09-15"}).json()
    assert (month["period"]["start"], month["period"]["end"], month["totals"]["answers"]) == ("2026-09-01", "2026-09-30", 1)
    day = client.get(f"/api/profiles/{pid}/summary", params={"period": "day"}).json()
    assert day["totals"]["answers"] == 1
    assert client.get(f"/api/profiles/{pid}/summary", params={"period": "year"}).status_code == 422


def test_leaderboard_by_period_uses_points(fixed):
    client, db_path = fixed
    a, b = make_profile(client, "Anne"), make_profile(client, "Bob")
    for _ in range(3):
        attempt(client, a, exercise="caged_play")                   # 3 x 2 points this week
    for _ in range(20):
        old_attempt(db_path, b, "2026-08-01T10:00:00+00:00")         # 20 x 1 point long ago, plus a streak bonus of 10
    week = client.get("/api/leaderboard", params={"period": "week"}).json()
    assert [(r["name"], r["score"]) for r in week] == [("Anne", 6 + 5), ("Bob", 0)]
    all_time = client.get("/api/leaderboard").json()
    assert [(r["name"], r["score"]) for r in all_time] == [("Bob", 20 + 10 + 5), ("Anne", 11)]
    assert client.get("/api/leaderboard", params={"period": "decade"}).status_code == 422
    profiles = {p["name"]: p["score"] for p in client.get("/api/profiles").json()}
    assert profiles == {"Anne": 11, "Bob": 35}


def test_deleting_a_profile_removes_sessions_and_goals(fixed):
    client, db_path = fixed
    pid = make_profile(client)
    client.post("/api/sessions", json={"profile_id": pid, "activity": "metronome", "seconds": 60})
    client.post(f"/api/profiles/{pid}/goals", json={"metric": "minutes", "target": 10, "period": "day"})
    assert client.delete(f"/api/profiles/{pid}").status_code == 204
    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM goals").fetchone()[0] == 0


def test_scoring_rules_are_published(client):
    r = client.get("/api/scoring").json()
    assert r["answer_points"]["caged_play"] == 2 and r["streak_every"] == 10 and r["day_bonus"] == 5


def test_connection_can_be_used_from_another_thread(tmp_path):
    # FastAPI may open the database in one worker thread and run the endpoint in another
    conn = connect(tmp_path / "threads.db")
    out = []
    worker = threading.Thread(target=lambda: out.append(conn.execute("SELECT 1").fetchone()[0]))
    worker.start()
    worker.join()
    conn.close()
    assert out == [1]
