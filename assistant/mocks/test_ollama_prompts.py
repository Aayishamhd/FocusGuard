"""Task decomposition and prompt verification CLI tool."""

import argparse
import json
import sys

try:
    import httpx
except ImportError:
    print("Error: httpx is required. Install dependencies or activate the virtualenv.")
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Test task decomposition prompts against FocusGuard Assistant.")
    parser.add_argument(
        "--task",
        required=True,
        help="Task description to decompose (e.g., 'Prepare presentation')",
    )
    parser.add_argument(
        "--difficulty",
        default="moderate",
        choices=["quick", "moderate", "complex"],
        help="Difficulty level hint.",
    )
    parser.add_argument(
        "--url",
        default="http://127.0.0.1:5002",
        help="Base URL of FocusGuard Assistant service.",
    )

    args = parser.parse_args()

    # Step 1: Health / Mode Check
    health_url = f"{args.url.rstrip('/')}/health"
    try:
        health_resp = httpx.get(health_url, timeout=3.0)
        if health_resp.status_code == 200:
            health = health_resp.json()
            is_llm = health.get("llmConnected", False)
            model = health.get("model", "N/A")
            engine_str = f"Ollama LLM ({model})" if is_llm else "Offline Heuristic Fallback Engine"
            print(f"\n[FocusGuard Assistant connected: {engine_str}]")
        else:
            print(f"\n[Warning: Service health returned {health_resp.status_code}]")
    except httpx.ConnectError:
        print(f"\n[!] Error: Cannot connect to service at {args.url}.")
        print("Please ensure the service is running:")
        print("  python -m uvicorn src.server:app --app-dir assistant --host 127.0.0.1 --port 5002")
        sys.exit(1)
    except Exception as e:
        print(f"\n[Warning: Health check failed: {e}]")

    # Step 2: Request Decomposition
    endpoint = f"{args.url.rstrip('/')}/api/decompose"
    payload = {
        "taskDescription": args.task,
        "difficultyLevel": args.difficulty,
    }

    print(f"\nDecomposing task: '{args.task}' ...")
    try:
        resp = httpx.post(endpoint, json=payload, timeout=15.0)
    except Exception as e:
        print(f"[!] Decomposition request failed: {e}")
        sys.exit(1)

    if resp.status_code != 200:
        print(f"[!] API error ({resp.status_code}): {resp.text}")
        sys.exit(1)

    result = resp.json()
    print("\nValidated Task Decomposition Response (JSON):")
    print(json.dumps(result, indent=2))

    subtasks = result.get("subtasks", [])
    print(f"\nGenerated {len(subtasks)} Sequential Subtasks:")
    for st in subtasks:
        flag = "* [IMMEDIATE NEXT STEP]" if st.get("isImmediateNextStep") else ""
        print(f"  Step {st.get('stepNumber')}: {st.get('title')} ({st.get('estimatedMinutes')} mins) {flag}")
        print(f"          {st.get('description')}")


if __name__ == "__main__":
    main()
