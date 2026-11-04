/**
 * @file faultSandbox.ts
 * @description State-Machine Fault Simulation Sandbox Engine ("Practice Mode").
 * Programmatically alters board electrical properties (dead shorts, blown fuses,
 * intermittent thermal shorts, and inter-rail leakage) and manages the 3-Tier
 * Diagnostic Training Progression Matrix.
 */

import { PCBBoardSchema } from './pcbSchema';

export interface FaultScenarioLevel {
  scenarioId: string;
  levelNumber: 1 | 2 | 3 | 0;
  shortTag: string;
  title: string;
  complexityLabel: string;
  symptomBrief: string;
  targetComponentId: string;
  affectedNetId: string;
  faultConfig: {
    faultType:
      | 'NONE'
      | 'DEAD_SHORT_GND'
      | 'BLOWN_FUSE_OPEN'
      | 'INTERMITTENT_THERMAL_SHORT'
      | 'RAIL_TO_DATA_LEAKAGE';
    faultResistanceOhms: number;
    leakingIntoNetId?: string;
    leakageResistanceOhms?: number;
  };
  guidedSteps: string[];
  engineeringExplanation: string;
}

export const FAULT_PROGRESSION_MATRIX: FaultScenarioLevel[] = [
  {
    scenarioId: 'nominal_board',
    levelNumber: 0,
    shortTag: 'Nominal Golden Board',
    title: 'Golden Reference Board (No Faults)',
    complexityLabel: 'Baseline Calibration',
    symptomBrief: 'All power rails (20.5V USB-C, 12.6V PPVBAT, 3.3V G3H, 19.5V Backlight) operate within nominal telemetry limits.',
    targetComponentId: '',
    affectedNetId: 'PP3V3_G3H',
    faultConfig: {
      faultType: 'NONE',
      faultResistanceOhms: 0
    },
    guidedSteps: [
      'Probe TP_USBC_20V (R2, C4) to verify 20.50V USB-C PD input.',
      'Probe TP_PPVBAT (R7, C9) to verify 12.60V main buck-boost rail.',
      'Probe TP_3V3_G3H (R10, C4) and TP_19V_BKLT (R10, C13) to record baseline voltages and Ω-to-GND signatures.'
    ],
    engineeringExplanation:
      'Use this known-good reference state to familiarize yourself with healthy voltage, diode-drop, and resistance-to-ground signatures.'
  },
  {
    scenarioId: 'level_1_blown_fuse',
    levelNumber: 1,
    shortTag: 'Lvl 1: Open Fuse F700',
    title: 'Level 1 — Blown Primary Fuse & Open Input Line',
    complexityLabel: 'Tier 1 • Continuity & Power Tree Tracing',
    symptomBrief: 'Customer reports dead unit after transient surge. USB-C port draws 12mA at 5.18V; main system bus PPDCIN_G3H is completely dead (0.00V).',
    targetComponentId: 'F700',
    affectedNetId: 'PPDCIN_G3H',
    faultConfig: {
      faultType: 'BLOWN_FUSE_OPEN',
      faultResistanceOhms: 9999999
    },
    guidedSteps: [
      '1. Measure Voltage DC at J3300 / TP_USBC_20V (R2, C4): reads 5.18V USB-C fallback because U3100 lacks 3.3V G3H.',
      '2. Probe TP_DCIN_FUSE (R2, C7) downstream of F700: reads 0.00V DC, but Resistance to GND is healthy (39.20 kΩ — no downstream short).',
      '3. Isolate F700 (R3, C6) and click "Rework & Replace Faulty Component" to restore the 3A fast-acting fuse.'
    ],
    engineeringExplanation:
      'When F700 blows open from an adapter surge without a permanent downstream short on PPDCIN_G3H, PPVBAT_G3H_CHGR and PP3V3_G3H collapse to 0V, preventing U3100 from negotiating 20V PD.'
  },
  {
    scenarioId: 'level_2_standby_short',
    levelNumber: 2,
    shortTag: 'Lvl 2: 0.6Ω Short C704',
    title: 'Level 2 — 0.6 Ω Standby Rail Short to Ground',
    complexityLabel: 'Tier 2 • Low-Z Short Isolation & Thermal IR',
    symptomBrief: 'Board fails to power on. PPDCIN_G3H (20.4V) and PPVBAT_G3H_CHGR (12.6V) are present, but Always-On standby rail PP3V3_G3H is pulled down to 0.13V.',
    targetComponentId: 'C704',
    affectedNetId: 'PP3V3_G3H',
    faultConfig: {
      faultType: 'DEAD_SHORT_GND',
      faultResistanceOhms: 0.6
    },
    guidedSteps: [
      '1. Probe TP_3V3_G3H (R10, C4) in Voltage DC mode: rail is collapsed at 0.13V instead of 3.30V.',
      '2. Switch Multimeter to Resistance (Ω) mode: PP3V3_G3H measures ~0.60 Ω to ground (expected 14.2 kΩ).',
      '3. Enable Thermal IR View or probe C704 (R10, C5) vs U7800 (R8, C5) — C704 glows at 78.4 °C with lowest parasitic resistance (0.60 Ω). Rework C704!'
    ],
    engineeringExplanation:
      'A cracked 0402 decoupling MLCC (C704) creates a 0.6 Ω bridge to ground on PP3V3_G3H. Every component on PP3V3_G3H shows a short, so technicians use 4-wire milliohm gradients and Thermal IR imaging to pinpoint C704.'
  },
  {
    scenarioId: 'level_3_backlight_leakage',
    levelNumber: 3,
    shortTag: 'Lvl 3: 19V→SDA Leakage',
    title: 'Level 3 — 19V Backlight Rail Leaking into I2C Data Line',
    complexityLabel: 'Tier 3 • Cross-Domain High-Voltage Leakage',
    symptomBrief: 'System boots with chimes, but LCD backlight stays dark/flickering. No rail is shorted to ground, yet I2C brightness commands fail completely.',
    targetComponentId: 'C8512',
    affectedNetId: 'I2C_BKLT_SDA',
    faultConfig: {
      faultType: 'RAIL_TO_DATA_LEAKAGE',
      faultResistanceOhms: 420,
      leakingIntoNetId: 'I2C_BKLT_SDA',
      leakageResistanceOhms: 420
    },
    guidedSteps: [
      '1. Probe TP_19V_BKLT (R10, C13): reads drooped 14.20V instead of 19.50V, yet resistance to ground is high (no GND short).',
      '2. Probe TP_I2C_SDA (R12, C10) on the 3.3V I2C data bus: reads a dangerous 11.84V overvoltage!',
      '3. Inspect C8512 (R10, C11) where 19V_BACKLIGHT sits adjacent to I2C_BKLT_SDA. Replace corroded C8512 to clear the cross-rail bridge.'
    ],
    engineeringExplanation:
      'Dendritic corrosion under C8512 creates a 420 Ω resistive bridge between 19V_BACKLIGHT and the adjacent 3.3V I2C_BKLT_SDA trace, back-feeding 11.84V into the data bus and pulling down the boost rail.'
  }
];

/**
 * Clears all active faults on the board and injects the specified scenario fault.
 */
export function applyFaultScenarioToBoard(
  schema: PCBBoardSchema,
  scenarioId: string
): { updatedSchema: PCBBoardSchema; activeScenario: FaultScenarioLevel } {
  const cloned: PCBBoardSchema = JSON.parse(JSON.stringify(schema));

  // Clear all existing faults first
  Object.values(cloned.components).forEach((comp) => {
    comp.electrical.activeFault = {
      faultType: 'NONE',
      faultResistanceOhms: 0
    };
  });

  const scenario =
    FAULT_PROGRESSION_MATRIX.find((s) => s.scenarioId === scenarioId) ||
    FAULT_PROGRESSION_MATRIX[0];

  if (scenario.targetComponentId && cloned.components[scenario.targetComponentId]) {
    cloned.components[scenario.targetComponentId].electrical.activeFault = {
      ...scenario.faultConfig
    };
  }

  return {
    updatedSchema: cloned,
    activeScenario: scenario
  };
}

/**
 * Programmatically injects or clears a custom fault on any chosen component in Sandbox Mode.
 */
export function injectCustomComponentFault(
  schema: PCBBoardSchema,
  componentId: string,
  faultType:
    | 'NONE'
    | 'DEAD_SHORT_GND'
    | 'BLOWN_FUSE_OPEN'
    | 'INTERMITTENT_THERMAL_SHORT'
    | 'RAIL_TO_DATA_LEAKAGE',
  resistanceOhms: number = 0.6
): PCBBoardSchema {
  const cloned: PCBBoardSchema = JSON.parse(JSON.stringify(schema));
  const comp = cloned.components[componentId];
  if (!comp) return cloned;

  if (faultType === 'NONE') {
    comp.electrical.activeFault = {
      faultType: 'NONE',
      faultResistanceOhms: 0
    };
  } else {
    comp.electrical.activeFault = {
      faultType,
      faultResistanceOhms: resistanceOhms,
      leakingIntoNetId: faultType === 'RAIL_TO_DATA_LEAKAGE' ? 'I2C_BKLT_SDA' : undefined,
      leakageResistanceOhms: faultType === 'RAIL_TO_DATA_LEAKAGE' ? 420 : undefined
    };
  }

  return cloned;
}
