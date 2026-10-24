"""Event replay script for testing intervention decisions against synthetic events."""

import argparse
import json
import os
import sys
from typing import Any, Dict

try:
    import httpx
except ImportError:
    print("Error: httpx is required. Install dependencies or activate the virtualenv.")
    sys.exit(1)


def load_events(file_path: str) -> Dict[str, Any]:
    """Load sample events dictionary from JSON file."""
    if not os.path.exists(file_path):
        print(f"Error: Sample events file '{file_path}' not found.")
        sys.exit(1)
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("scenarios", {})


def check_health(base_url: str) -> Dict[str, Any]:
    """Check health and fallback status of the assistant service."""
    health_url = f"{base_url.rstrip('/')}/health"
    try:
        resp = httpx.get(health_url, timeout=3.0)
        if resp.status_code == 200:
            return resp.json()
        return {"status": "error", "statusCode": resp.status_code}
    except Exception as e:
        return {"status": "unreachable", "error": str(e)}


def replay_scenario(scenario_name: str, event_data: dict, service_url: str) -> None:
    """Send an attention event to the intervention API and format results."""
    print(f"\n{'='*70}")
    print(f">> Replaying Scenario: [{scenario_name}]")
    print(f"  App: {event_data.get('activeApp', {}).get('appName')} ({event_data.get('activeApp', {}).get('category')})")
    print(f"  Attention State: {event_data.get('attentionState')} (Confidence: {event_data.get('confidence')})")
    print(f"  Duration: {event_data.get('metrics', {}).get('sessionDurationSeconds')}s | Switches: {event_data.get('metrics', {}).get('recentSwitchCount')}")
    print(f"{'-'*70}")

    endpoint = f"{service_url.rstrip('/')}/api/intervene"
    try:
        resp = httpx.post(endpoint, json=event_data, timeout=10.0)
    except httpx.ConnectError:
        print(f"\n[!] Connection Error: Could not connect to FocusGuard Assistant at {service_url}")
        print("Please ensure the service is running:")
        print("  python -m uvicorn src.server:app --app-dir assistant --host 127.0.0.1 --port 5002")
        return
    except Exception as e:
        print(f"\n[!] Request failed: {e}")
        return

    if resp.status_code != 200:
        print(f"[!] Server returned error status {resp.status_code}: {resp.text}")
        return

    decision = resp.json()
    level = decision.get("level", "UNKNOWN")
    intervene = decision.get("shouldIntervene", False)
    reason = decision.get("triggerReason", "N/A")
    message = decision.get("message")
    actions = decision.get("actions") or []
    break_mins = decision.get("suggestedBreakMinutes")

    status_str = "INTERVENTION RECOMMENDED" if intervene else "SILENT (NO INTERVENTION)"
    print(f"Decision ID:     {decision.get('decisionId')}")
    print(f"Intervention:    [{status_str}]")
    print(f"Level:           {level}")
    print(f"Trigger Reason:  {reason}")

    if message:
        print(f"User Message:    \"{message}\"")
    if break_mins:
        print(f"Suggested Break: {break_mins} minutes")
    if actions:
        print("Action Buttons:")
        for act in actions:
            print(f"  - [{act.get('actionId')}] {act.get('label')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay synthetic attention events to FocusGuard Assistant.")
    parser.add_argument(
        "--scenario",
        default="heavy-distraction",
        help="Scenario name to replay (e.g., heavy-distraction, stable-work, productive-research, prolonged-focus, missing-context, or 'all')",
    )
    parser.add_argument(
        "--file",
        default=os.path.join(os.path.dirname(__file__), "sample_events.json"),
        help="Path to sample events JSON file.",
    )
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:5002",
        help="Base URL of FocusGuard Assistant service.",
    )

    args = parser.parse_args()
    scenarios = load_events(args.file)

    # Health check
    health = check_health(args.url)
    print("\n[*] Checking FocusGuard Assistant Status...")
    if health.get("status") == "ok":
        mode = "Ollama Active" if health.get("llmConnected") else "Heuristic Fallback Mode"
        print(f"[OK] Service Online at {args.url} | Status: {mode} (Model: {health.get('model')})")
    else:
        print(f"[WARN] Service is not reachable at {args.url}.")
        print("Start the service with:")
        print("  python -m uvicorn src.server:app --app-dir assistant --host 127.0.0.1 --port 5002\n")

    target = args.scenario.strip().lower()
    if target == "all":
        for name, data in scenarios.items():
            replay_scenario(name, data, args.url)
    else:
        if target in scenarios:
            replay_scenario(target, scenarios[target], args.url)
        else:
            print(f"Unknown scenario '{target}'. Available scenarios: {', '.join(scenarios.keys())}")


if __name__ == "__main__":
    main()
