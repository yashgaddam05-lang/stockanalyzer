export {
  computeScenario,
  buildScenarioSet,
  sensitivityTable,
  defaultInputsFromStock,
  BEAR,
  BULL,
  TARGET_MIN,
  TARGET_MAX,
  HORIZON_MIN_MONTHS,
  HORIZON_MAX_MONTHS,
  DEFAULT_TARGET,
  DEFAULT_HORIZON_MONTHS,
  DEFAULT_GROWTH_MIN,
  DEFAULT_GROWTH_MAX,
} from './calculator.js';
export type {
  ScenarioInputs,
  ScenarioResult,
  ScenarioWithInputs,
  ScenarioSet,
  SensitivityTable,
  ProjectedOutcome,
  KeyAssumption,
} from './calculator.js';
export { FLAG_THRESHOLDS } from './flags.js';
export type { SanityFlag } from './flags.js';
