"""Tests for the backend. Run with:  pytest -q

Every test gets its own empty database in a temporary folder.
"""
import pytest
from fastapi.testclient import TestClient

from app import create_app, streaks


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
    assert r.status_code == 200 and "<title>CAGED Ear Trainer</title>" in r.text


def test_streaks_helper():
    assert streaks([]) == (0, 0)
    assert streaks([1, 1, 0, 1]) == (1, 2)
    assert streaks([0, 1, 1, 1]) == (3, 3)
