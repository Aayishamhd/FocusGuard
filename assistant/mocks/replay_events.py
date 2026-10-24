"""
assistant/mocks/replay_events.py

CLI replay harness — sends sample AttentionEvents to the live assistant service.
Lets Feature 2 developers test intervention logic and lets Feature 3 teammates
verify their UI against real HTTP responses without running Feature 1.

Usage:
    python mocks/replay_events.py                          # replay all scenarios
    python mocks/replay_events.py --scenario distracted    # replay one scenario
    python mocks/replay_events.py --scenario all           # replay all (explicit)
    python mocks/replay_events.py --host 127.0.0.1 --port 5002

Run from the /assistant directory.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx

SAMPLE_FILE = Path(__file__).parent / "sample_events.json"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 5002


def load_events() -> list[dict]:
    with SAMPLE_FILE.open() as f:
        return json.load(f)


def replay(scenario: str, base_url: str) -> None:
    events = load_events()

    if scenario != "all":
        events = [e for e in events if e.get("_scenario") == scenario]
        if not events:
            available = [e["_scenario"] for e in load_events()]
            print(f"[ERROR] Unknown scenario '{scenario}'. Available: {available}")
            sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  FocusGuard — AI Assistant Replay Harness")
    print(f"  Target: {base_url}")
    print(f"  Scenarios: {[e['_scenario'] for e in events]}")
    print(f"{'='*60}\n")

    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        # Health check first
        try:
            r = client.get("/health")
            r.raise_for_status()
            print(f"[HEALTH] {r.json()}\n")
        except Exception as exc:
            print(f"[ERROR] Service not reachable at {base_url}: {exc}")
            print("  → Make sure the service is running:")
            print("    cd assistant && uvicorn src.server:app --port 5002 --reload")
            sys.exit(1)

        for event in events:
            # Strip internal metadata keys before posting
            payload = {k: v for k, v in event.items() if not k.startswith("_")}
            scenario_name = event.get("_scenario", "unknown")
            description = event.get("_description", "")

            print(f"── Scenario: {scenario_name}")
            print(f"   {description}")

            try:
                # POST /api/intervene
                r = client.post("/api/intervene", json=payload)
                r.raise_for_status()
                decision = r.json()
                print(f"   → shouldIntervene={decision['shouldIntervene']}  "
                      f"level={decision['level']}")
                if decision.get("message"):
                    print(f"   → message: \"{decision['message']}\"")
                if decision.get("actions"):
                    labels = [a["label"] for a in decision["actions"]]
                    print(f"   → actions: {labels}")
            except Exception as exc:
                print(f"   [FAIL] /api/intervene: {exc}")

            print()
            time.sleep(0.3)  # small delay so output is readable


def replay_decompose(base_url: str) -> None:
    """Quick smoke test for /api/decompose."""
    tasks = [
        "Build the project presentation",
        "Complete the final report and submit it, then notify the team",
        "Fix the authentication bug",
    ]
    print("── Decompose Smoke Test")
    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        for task in tasks:
            r = client.post("/api/decompose", json={"taskDescription": task})
            r.raise_for_status()
            resp = r.json()
            print(f"   Task: \"{task}\"")
            for step in resp["subtasks"]:
                flag = "★" if step["isImmediateNextStep"] else " "
                print(f"   {flag} {step['stepNumber']}. {step['title']}")
            print()


def replay_recover(base_url: str) -> None:
    """Quick smoke test for /api/recover."""
    reasons = ["tired", "task_confusing", "distracted", "need_break", "other"]
    print("── Recovery Smoke Test")
    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        for reason in reasons:
            payload = {
                "sessionId": "mock-session-001",
                "currentTask": "Complete the project report",
                "userReason": reason,
            }
            r = client.post("/api/recover", json=payload)
            r.raise_for_status()
            resp = r.json()
            print(f"   reason={reason} → {resp['recommendation']}")
            print(f"   \"{resp['supportiveMessage']}\"")
            print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replay sample AttentionEvents against the assistant service."
    )
    parser.add_argument(
        "--scenario",
        default="all",
        help=(
            "Scenario to replay: focused | focused-long | possibly-drifting | "
            "distracted | recovering | idle | all (default: all)"
        ),
    )
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--full",
        action="store_true",
        help="Also run decompose and recover smoke tests",
    )
    args = parser.parse_args()

    base_url = f"http://{args.host}:{args.port}"
    replay(args.scenario, base_url)

    if args.full:
        replay_decompose(base_url)
        replay_recover(base_url)


if __name__ == "__main__":
    main()
