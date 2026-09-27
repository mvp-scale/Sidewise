/** @mvpscale/sidewise: the library surface behind the `sidewise` CLI. */
export * from './lens/consensus.ts';
export * from './classifier/port.ts';
export { createFakeAdapter, FAKE_MODEL } from './classifier/fake.ts';
export { createTypesafeAdapter } from './classifier/typesafe/adapter.ts';
export { selectProvider } from './classifier/select.ts';
export * from './ledger/paths.ts';
export { formatRunId, RUN_ID, ulid } from './ledger/ids.ts';
export { redact, redactDeep, redactSecrets } from './ledger/redact.ts';
export * from './ledger/log.ts';
export { recordCall } from './ledger/record.ts';
export { LockError } from './ledger/lock.ts';
export * from './budget/budget.ts';
// Exported as 'ContractRequest' rather than 'Request' to avoid colliding with another request type once
// defined elsewhere; kept as the alias so nothing downstream has to be renamed.
export {
  VERBS,
  type Verb,
  DEPTHS,
  type Depth,
  DEPTH_COUNT,
  WHYS,
  AREAS,
  type Why,
  type Area,
  MAX_EXTRAS,
  type Pass,
  type Need,
  type Question,
  type Category,
  type Layer,
  type Side,
  type Wise,
  type Request as ContractRequest,
  type Stop,
  type Gate,
  type Answer,
} from './contract/types.ts';
export * from './contract/read.ts';
export * from './contract/schema-check.ts';
export * from './contract/layers.ts';
export * from './contract/validate.ts';
export * from './contract/grade.ts';
export * from './contract/emit.ts';
export * from './contract/translate.ts';
export * from './evidence/code.ts';
export * from './evidence/glob.ts';
export * from './evidence/split.ts';
export * from './evidence/git.ts';
export * from './evidence/units.ts';
export { createChaosAdapter, parseSchedule, type ChaosStep } from './classifier/chaos.ts';
export { providerIdentity } from './classifier/select.ts';
export * from './ledger/reuse.ts';
export * from './verbs/types.ts';
export { runClass } from './verbs/class.ts';
export { runView } from './verbs/view.ts';
export { runChange } from './verbs/change.ts';
export { runScan } from './verbs/scan.ts';
export { runDrill } from './verbs/drill.ts';
export { runLoop } from './verbs/loop.ts';
export { runReport, type ReportContext } from './verbs/report.ts';
export { runTemplate, type TemplateFlags, TEMPLATE_VERBS } from './verbs/template.ts';
