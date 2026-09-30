/**
 * Is this project's agent guidance wired up? `ok` (AGENTS.md has the mm3 block, and every CLAUDE.md that
 * exists imports AGENTS.md), `claude-md-no-import` (the block is there but Claude Code, which reads CLAUDE.md
 * and not AGENTS.md, will never see it) or `no-block`. Two readers share this one answer: the one-time `agents:`
 * note every verb's response carries on a project's first real run (verbs/respond.ts's commonNotes), and the
 * `agents:` line `mm3 doctor` always prints. The note is recorded by a marker file in `.mm3/` so it appears once
 * per project; doctor never reads or writes that marker.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Mm3Paths } from '../ledger/paths.ts';
import { AGENTS_FILE, CLAUDE_FILES, findBlock, importsAgents } from './agents-file.ts';

export type AgentsState = 'ok' | 'claude-md-no-import' | 'no-block';
export const AGENTS_NOTE_MARKER = 'agents-note-shown';

const read = (file: string): string | undefined => (existsSync(file) ? readFileSync(file, 'utf8') : undefined);

export function agentsState(root: string): AgentsState {
  const agents = read(path.join(root, AGENTS_FILE));
  if (agents === undefined || typeof findBlock(agents) === 'string') return 'no-block';
  for (const { rel } of CLAUDE_FILES) {
    const text = read(path.join(root, rel));
    if (text !== undefined && !importsAgents(text)) return 'claude-md-no-import';
  }
  return 'ok';
}

/** The fix text for a state that is not ok (no "agents: " prefix: doctor's field and the note each add their own). */
export const AGENTS_FIX: Record<Exclude<AgentsState, 'ok'>, string> = {
  'claude-md-no-import': 'Claude reads CLAUDE.md, not AGENTS.md → add the line @AGENTS.md to CLAUDE.md (or run mm3 init --agents)',
  'no-block': 'no MM3 guidance in AGENTS.md → mm3 init --agents adds it (shows the lines first)',
};

/** doctor's `agents:` value: the fix while not ok, else "ok". */
export function agentsDoctorValue(root: string): string {
  const state = agentsState(root);
  return state === 'ok' ? 'ok' : AGENTS_FIX[state];
}

/** The one-time note, consuming it: undefined when the project is ok or the note was already shown here. A
 *  marker that can't be written (read-only ledger) just means the note may show again; it never fails a run. */
export function takeAgentsNote(paths: Mm3Paths): string | undefined {
  if (existsSync(path.join(paths.dir, AGENTS_NOTE_MARKER))) return undefined;
  const state = agentsState(paths.root);
  if (state === 'ok') return undefined;
  try {
    writeFileSync(path.join(paths.dir, AGENTS_NOTE_MARKER), 'shown\n');
  } catch {
    // best effort
  }
  return `agents: ${AGENTS_FIX[state]}`;
}
