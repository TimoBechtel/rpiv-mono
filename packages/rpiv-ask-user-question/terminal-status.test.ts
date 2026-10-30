import { getKeybindings } from "@earendil-works/pi-tui";
import { createMockCtx, createMockPi, makeTheme, makeTui } from "@juicesharp/rpiv-test-utils";
import { describe, expect, it, vi } from "vitest";
import { registerAskUserQuestionTool } from "./ask-user-question.ts";
import { blockTerminalStatus } from "./terminal-status.ts";

describe("question terminal status", () => {
	it("keeps concurrent questions blocked until the last one closes", () => {
		const report = vi.fn();
		const terminal = { setProgramStatus: report };
		const first = blockTerminalStatus({ terminal, idle: false });
		const second = blockTerminalStatus({ terminal, idle: false });
		expect(report).toHaveBeenLastCalledWith({ state: "blocked", kind: "question", app: "pi" });
		terminal.setProgramStatus({ state: "working", app: "pi", message: "Session" });
		first();
		expect(report).toHaveBeenCalledTimes(1);
		second();
		expect(report).toHaveBeenLastCalledWith({ state: "working", app: "pi", message: "Session" });
		terminal.setProgramStatus({ state: "done" });
		expect(report).toHaveBeenLastCalledWith({ state: "done" });
	});

	it("restores cancellation instead of restarting activity", () => {
		const report = vi.fn();
		const terminal = { setProgramStatus: report };
		const release = blockTerminalStatus({ terminal, idle: false });
		terminal.setProgramStatus({ state: "idle", app: "pi" });
		release();
		expect(report).toHaveBeenLastCalledWith({ state: "idle", app: "pi" });
	});

	it("restores an idle host when no newer status arrives", () => {
		const report = vi.fn();
		const terminal = { setProgramStatus: report };
		const release = blockTerminalStatus({ terminal, idle: true });
		release();
		expect(report).toHaveBeenLastCalledWith({ state: "idle", app: "pi" });
	});

	it("preserves native dialog details and shutdown", () => {
		const report = vi.fn();
		const terminal = { setProgramStatus: report };
		const release = blockTerminalStatus({ terminal, idle: false });
		terminal.setProgramStatus({ state: "blocked", kind: "auth", message: "Log in" });
		expect(report).toHaveBeenLastCalledWith({ state: "blocked", kind: "auth", message: "Log in" });
		terminal.setProgramStatus({ state: "clear" });
		expect(report).toHaveBeenLastCalledWith({ state: "clear" });
		release();
		expect(report).toHaveBeenLastCalledWith({ state: "clear" });
	});
});

it.each([false, true])("reports and releases status through the actual dialog lifecycle (failure=%s)", async (fail) => {
	const { pi, captured } = createMockPi();
	registerAskUserQuestionTool(pi);
	const report = vi.fn();
	const terminal = { columns: 100, rows: 30, setProgramStatus: report };
	const custom = async (factory: (...args: unknown[]) => unknown) => {
		factory({ ...makeTui(), terminal }, makeTheme(), getKeybindings(), () => {});
		expect(report).toHaveBeenLastCalledWith({ state: "blocked", kind: "question", app: "pi" });
		if (fail) throw new Error("Dialog failed");
		return { answers: [], cancelled: true };
	};
	const ctx = { ...createMockCtx({ hasUI: true, ui: { custom } as never }), isIdle: () => false };
	const result = captured.tools.get("ask_user_question")!.execute!(
		"status-test",
		{ questions: [{ question: "Continue?", header: "Choice", options: [{ label: "Yes" }, { label: "No" }] }] },
		undefined,
		undefined,
		ctx as never,
	);
	if (fail) await expect(result).rejects.toThrow("Dialog failed");
	else await result;
	expect(report).toHaveBeenLastCalledWith({ state: "working", app: "pi" });
});
