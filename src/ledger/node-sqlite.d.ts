/**
 * Minimal ambient types for node:sqlite (stable since Node 22.13), only what ledger/index.ts calls. The pinned
 * devDependency @types/node (20.19.43, matching the old Node 20 floor) predates this module, so tsc has nothing
 * to check it against; this file exists only so `import('node:sqlite')` type-checks, not to model the whole API.
 */
declare module 'node:sqlite' {
  export interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
    [key: string]: unknown;
  }

  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): StatementResultingChanges;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  export class DatabaseSync {
    constructor(location: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
