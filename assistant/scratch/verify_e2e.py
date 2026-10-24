"""
assistant/scratch/verify_e2e.py

Verifies all Stage 7 End-to-End Scenarios against the running Attention Agent service (127.0.0.1:5002)
and direct subsystem modules.
"""

import json
import urllib.request
import urllib.error
import sys

BASE = "http://127.0.0.1:5002"

def post(endpoint, data):
    req = urllib.request.Request(
        f"{BASE}{endpoint}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))

results = {}

print("--- Testing Scenario A: Focused Developer ---")
payload_a = {
    "eventId": "ae-test-a",
    "timestamp": "2026-10-24T23:00:00.000Z",
    "attentionState": "FOCUSED",
    "confidence": 0.95,
    "activeApp": {"appName": "Code.exe", "windowTitle": "main.py - FocusGuard", "category": "work"},
    "metrics": {"sessionDurationSeconds": 1200, "appDurationSeconds": 300, "recentSwitchCount": 3, "inactivitySeconds": 0, "webcamEngaged": None},
    "sources": ["window_tracker", "activity_monitor"]
}
status_a, res_a = post("/api/intervene", payload_a)
results["A"] = {
    "status": status_a,
    "shouldIntervene": res_a.get("shouldIntervene"),
    "level": res_a.get("level"),
    "triggerReason": res_a.get("triggerReason"),
}
print("A:", results["A"])

print("--- Testing Scenario B: Possible Drift ---")
payload_b = {
    "eventId": "ae-test-b",
    "timestamp": "2026-10-24T23:05:00.000Z",
    "attentionState": "POSSIBLY_DRIFTING",
    "confidence": 0.75,
    "activeApp": {"appName": "Chrome.exe", "windowTitle": "Google Search", "category": "utility"},
    "metrics": {"sessionDurationSeconds": 1500, "appDurationSeconds": 120, "recentSwitchCount": 4, "inactivitySeconds": 10, "webcamEngaged": None},
    "sources": ["window_tracker", "activity_monitor"]
}
status_b, res_b = post("/api/intervene", payload_b)
results["B"] = {
    "status": status_b,
    "shouldIntervene": res_b.get("shouldIntervene"),
    "level": res_b.get("level"),
    "triggerReason": res_b.get("triggerReason"),
}
print("B:", results["B"])

print("--- Testing Scenario C: Strong Distraction ---")
payload_c = {
    "eventId": "ae-test-c",
    "timestamp": "2026-10-24T23:10:00.000Z",
    "attentionState": "DISTRACTED",
    "confidence": 0.90,
    "activeApp": {"appName": "Chrome.exe", "windowTitle": "YouTube - Lo-Fi Beats", "category": "entertainment"},
    "metrics": {"sessionDurationSeconds": 2400, "appDurationSeconds": 300, "recentSwitchCount": 6, "inactivitySeconds": 0, "webcamEngaged": None},
    "sources": ["window_tracker", "activity_monitor"]
}
status_c, res_c = post("/api/intervene", payload_c)
results["C"] = {
    "status": status_c,
    "shouldIntervene": res_c.get("shouldIntervene"),
    "level": res_c.get("level"),
    "actions": [a["actionId"] for a in res_c.get("actions", [])],
}
print("C:", results["C"])

print("--- Testing Scenario D: Large Task ---")
payload_d = {
    "taskDescription": "Build my final-year project presentation.",
    "difficultyLevel": "complex"
}
status_d, res_d = post("/api/decompose", payload_d)
results["D"] = {
    "status": status_d,
    "subtask_count": len(res_d.get("subtasks", [])),
    "subtasks": [s["title"] for s in res_d.get("subtasks", [])],
    "first_is_immediate": res_d.get("subtasks", [])[0]["isImmediateNextStep"] if res_d.get("subtasks") else False
}
print("D:", results["D"])

print("--- Testing Scenario E: Task Confusion ---")
payload_e = {
    "sessionId": "sess-e",
    "currentTask": "Build my final-year project presentation",
    "userReason": "task_confusing",
    "notes": "The task is confusing."
}
status_e, res_e = post("/api/recover", payload_e)
results["E"] = {
    "status": status_e,
    "recommendation": res_e.get("recommendation"),
    "supportiveMessage": res_e.get("supportiveMessage"),
    "actionPayload": res_e.get("actionPayload"),
}
print("E:", results["E"])

print("--- Testing Scenario F: Tired ---")
payload_f = {
    "sessionId": "sess-f",
    "currentTask": "Build my final-year project presentation",
    "userReason": "tired",
    "notes": "I am tired."
}
status_f, res_f = post("/api/recover", payload_f)
results["F"] = {
    "status": status_f,
    "recommendation": res_f.get("recommendation"),
    "supportiveMessage": res_f.get("supportiveMessage"),
    "suggestedBreakMinutes": res_f.get("actionPayload", {}).get("suggestedBreakMinutes") if res_f.get("actionPayload") else None,
}
print("F:", results["F"])

print("--- Testing Scenario I: Webcam Disabled ---")
payload_i = {
    "eventId": "ae-test-i",
    "timestamp": "2026-10-24T23:15:00.000Z",
    "attentionState": "FOCUSED",
    "confidence": 0.88,
    "activeApp": {"appName": "Code.exe", "windowTitle": "editor.py", "category": "work"},
    "metrics": {"sessionDurationSeconds": 900, "appDurationSeconds": 200, "recentSwitchCount": 1, "inactivitySeconds": 0, "webcamEngaged": False},
    "sources": ["window_tracker", "activity_monitor"]
}
status_i, res_i = post("/api/intervene", payload_i)
results["I"] = {
    "status": status_i,
    "shouldIntervene": res_i.get("shouldIntervene"),
    "level": res_i.get("level"),
}
print("I:", results["I"])

print("--- Testing Scenario J: Malformed Request ---")
payload_j = {
    "eventId": "ae-test-j",
    "confidence": 1.5,
    "activeApp": {"appName": "Code.exe"}
}
status_j, res_j = post("/api/intervene", payload_j)
results["J"] = {
    "status": status_j,
    "error_type": res_j.get("detail", [{}])[0].get("type"),
    "error_loc": res_j.get("detail", [{}])[0].get("loc"),
}
print("J:", results["J"])

with open("assistant/scratch/e2e_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\nALL HTTP SCENARIOS EXECUTED SUCCESSFULLY.")
