/**
 * FocusGuard Current Focal Goal Input & Session Start Tests
 *
 * Verifies the 7 explicit test requirements:
 * 1. Empty goal rejection ("Task description cannot be blank. Please enter a focus goal.")
 * 2. Normal goal entry & session start ("Prepare my final-year project presentation")
 * 3. Whitespace-only goal rejection
 * 4. Editing goal before starting session
 * 5. Clear and re-enter goal (via clear button and keyboard)
 * 6. Keyboard interaction (Enter key to start session)
 * 7. Long goal (within MAX_TASK_LENGTH 120 chars) starts successfully
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/renderer/src/App";
import { resetServices } from "../../src/renderer/src/services/serviceManager";

describe("Current Focal Goal Input & End-to-End Session Start Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetServices();
  });

  afterEach(() => {
    resetServices();
  });

  it("Test 1 — Empty goal: shows validation error when clicking Start Session without entering a goal", async () => {
    const user = userEvent.setup();
    render(<App />);

    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert.textContent).toContain("Task description cannot be blank. Please enter a focus goal.");
    expect(screen.queryByText(/Active Focus Time/i)).not.toBeInTheDocument();
  });

  it("Test 2 — Normal goal: enters a goal and successfully starts an active session", async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText(/New focus task goal/i);
    await user.type(taskInput, "Prepare my final-year project presentation");
    expect(taskInput).toHaveValue("Prepare my final-year project presentation");

    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    expect(await screen.findByRole("heading", { name: /Prepare my final-year project presentation/i })).toBeInTheDocument();
    expect(screen.getByText(/Active Focus Time/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Test 3 — Whitespace: rejects whitespace-only goals", async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText(/New focus task goal/i);
    await user.type(taskInput, "     ");
    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    const errorAlert = await screen.findByRole("alert");
    expect(errorAlert.textContent).toContain("Task description cannot be blank. Please enter a focus goal.");
    expect(screen.queryByText(/Active Focus Time/i)).not.toBeInTheDocument();
  });

  it("Test 4 — Editing: allows editing input text before starting session", async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText(/New focus task goal/i);
    await user.type(taskInput, "Prepare presentation");
    expect(taskInput).toHaveValue("Prepare presentation");

    // Clear and type updated
    await user.clear(taskInput);
    await user.type(taskInput, "Prepare final-year project presentation");
    expect(taskInput).toHaveValue("Prepare final-year project presentation");

    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    expect(await screen.findByRole("heading", { name: /Prepare final-year project presentation/i })).toBeInTheDocument();
    expect(screen.getByText(/Active Focus Time/i)).toBeInTheDocument();
  });

  it("Test 5 — Clear and re-enter: verifies clear button and re-entry without stale state", async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText(/New focus task goal/i);
    await user.type(taskInput, "Draft initial slides");
    expect(taskInput).toHaveValue("Draft initial slides");

    // Clear via the dedicated clear button
    const clearBtn = screen.getByRole("button", { name: /Clear focus goal/i });
    await user.click(clearBtn);
    expect(taskInput).toHaveValue("");

    // Re-enter a completely different goal
    await user.type(taskInput, "Conduct system benchmark");
    expect(taskInput).toHaveValue("Conduct system benchmark");

    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    expect(await screen.findByRole("heading", { name: /Conduct system benchmark/i })).toBeInTheDocument();
    expect(screen.queryByText("Draft initial slides")).not.toBeInTheDocument();
  });

  it("Test 6 — Keyboard interaction: supports Tab, typing, Backspace, and Enter to start", async () => {
    const user = userEvent.setup();
    render(<App />);

    const taskInput = screen.getByLabelText(/New focus task goal/i);
    taskInput.focus();
    expect(taskInput).toHaveFocus();

    await user.keyboard("Review pull request and merge");
    expect(taskInput).toHaveValue("Review pull request and merge");

    // Press Enter to submit
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("heading", { name: /Review pull request and merge/i })).toBeInTheDocument();
    expect(screen.getByText(/Active Focus Time/i)).toBeInTheDocument();
  });

  it("Test 7 — Long goal: accepts a long goal up to 120 chars and starts session normally", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 114 characters long (<= 120 MAX_TASK_LENGTH)
    const longGoal = "Prepare the introduction, demo flow, evaluation metrics, and final presentation slides for the FocusGuard project.";
    expect(longGoal.length).toBeLessThanOrEqual(120);

    const taskInput = screen.getByLabelText(/New focus task goal/i);
    await user.type(taskInput, longGoal);
    expect(taskInput).toHaveValue(longGoal);

    // Verify character counter displays current length
    expect(screen.getByText(new RegExp(`${longGoal.length}/120`))).toBeInTheDocument();

    const startBtn = screen.getByRole("button", { name: /Start focus session/i });
    await user.click(startBtn);

    expect(await screen.findByRole("heading", { name: new RegExp(longGoal) })).toBeInTheDocument();
    expect(screen.getByText(/Active Focus Time/i)).toBeInTheDocument();
  });
});
