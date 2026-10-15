export {
  MODEL_VERSION,
  DIMENSIONS,
  scoreStock,
  getDimension,
  rangePosition,
} from './model.js';
export type { DimensionKey, DimensionDef, DimensionResult, ScoreResult } from './model.js';
export { computeRiskScore, riskLabelFor } from './risk.js';
export type { RiskResult, RiskLabel } from './risk.js';
export { buildCases } from './cases.js';
export type { CaseKey, CaseSummary } from './cases.js';
export { PRESET_SCREENS, getPresetScreen, applyPresetScreen } from './presets.js';
export type { ScoredStock, PresetScreen } from './presets.js';
