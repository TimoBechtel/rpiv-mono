import type { ProgramStatus, Terminal } from "@earendil-works/pi-tui";

const waiting = new WeakMap<StatusTerminal, { count: number; release: () => void }>();

/** Keep custom questions blocked without losing status changes made by Pi during the wait. */
export function blockTerminalStatus({ terminal, idle }: { terminal: StatusTerminal; idle: boolean }): () => void {
	let pending = waiting.get(terminal);
	if (!pending) {
		const report = terminal.setProgramStatus;
		let latest: ProgramStatus = { state: idle ? "idle" : "working", app: "pi" };
		terminal.setProgramStatus = (status) => {
			latest = status;
			// Preserve another dialog's richer blocked status and terminal shutdown.
			if (status.state === "blocked" || status.state === "clear") report.call(terminal, status);
		};
		pending = {
			count: 0,
			release() {
				terminal.setProgramStatus = report;
				waiting.delete(terminal);
				report.call(terminal, latest);
			},
		};
		waiting.set(terminal, pending);
		report.call(terminal, { state: "blocked", kind: "question", app: "pi" });
	}
	pending.count++;
	return () => {
		if (--pending.count === 0) pending.release();
	};
}

type StatusTerminal = Pick<Terminal, "setProgramStatus">;
