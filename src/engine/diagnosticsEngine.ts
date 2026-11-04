/**
 * @file diagnosticsEngine.ts
 * @description Nodal Electrical Solver & Diagnostics Telemetry Engine ("Test Mode").
 * Computes real-time DC rail voltages, parallel/series equivalent resistance to ground (Ohms),
 * diode-mode silicon junction drops (V), current draw (A), and Joule heating temperatures (°C).
 */

import { PCBBoardSchema, PCBComponentNode, PCBNetRail } from './pcbSchema';

export type MultimeterMode = 'VOLTAGE_DC' | 'RESISTANCE_OHM' | 'DIODE_DROP' | 'THERMAL_TEMP';

export type TelemetryHealthStatus =
  | 'NOMINAL'
  | 'SHORT_TO_GND'
  | 'OPEN_LINE'
  | 'RAIL_LEAKAGE'
  | 'UNDERVOLTAGE';

export interface SolvedNetTelemetry {
  netId: string;
  actualVoltageDc: number;
  actualResistanceToGndOhms: number;
  actualDiodeDropV: number;
  actualCurrentA: number;
  status: TelemetryHealthStatus;
  faultCulpritId: string | null;
  diagnosticSummary: string;
}

export interface ProbeMeasurementResult {
  mode: MultimeterMode;
  redProbe: { row: number; col: number; targetId: string; netId: string };
  blackProbe: { row: number; col: number; targetId: string; netId: string };
  displayValue: string;
  unit: string;
  numericValue: number;
  expectedValueText: string;
  status: TelemetryHealthStatus;
  verdictTitle: string;
  verdictDetail: string;
  continuityBeep: boolean;
}

export interface BoardElectricalSolution {
  powerConnected: boolean;
  psuInputVoltageV: number;
  psuCurrentDrawA: number;
  psuProtectionTripped: boolean;
  ambientTempC: number;
  netSolutions: Record<string, SolvedNetTelemetry>;
  componentTemperaturesC: Record<string, number>;
}

/**
 * Solves the entire PCB electrical graph given the current component state,
 * active faults, power supply connection state, and animation time (for intermittent faults).
 */
export function solveBoardElectricalState(
  schema: PCBBoardSchema,
  powerConnected: boolean,
  animTimeSec: number = 0
): BoardElectricalSolution {
  const ambientTempC = 24.2;
  const netSolutions: Record<string, SolvedNetTelemetry> = {};
  const componentTemperaturesC: Record<string, number> = {};

  // Initialize component temperatures to ambient + slight normal operating warmth
  Object.values(schema.components).forEach((comp) => {
    let baseWarmth = 0;
    if (powerConnected) {
      if (comp.category === 'ic') baseWarmth = 7.5;
      else if (comp.category === 'power') baseWarmth = 5.2;
      else if (comp.category === 'protection') baseWarmth = 1.4;
    }
    componentTemperaturesC[comp.id] = ambientTempC + baseWarmth;
  });

  // Step 1: Compute effective parallel resistance to ground for each net
  Object.values(schema.netlists).forEach((net) => {
    if (net.netId === 'GND') {
      netSolutions.GND = {
        netId: 'GND',
        actualVoltageDc: 0.0,
        actualResistanceToGndOhms: 0.05,
        actualDiodeDropV: 0.0,
        actualCurrentA: 0.0,
        status: 'NOMINAL',
        faultCulpritId: null,
        diagnosticSummary: net.telemetryExpectation.diagnosticNotes.nominal
      };
      return;
    }

    let conductancesSum = 1 / Math.max(1, net.telemetryExpectation.expectedResistanceToGndOhms);
    let faultCulpritId: string | null = null;
    let status = 'NOMINAL' as TelemetryHealthStatus;

    net.connectedComponents.forEach((compId) => {
      const comp = schema.components[compId];
      if (!comp || !comp.electrical.activeFault) return;
      const fault = comp.electrical.activeFault;

      if (fault.faultType === 'DEAD_SHORT_GND' && comp.primaryNetId === net.netId) {
        const shortR = Math.max(0.15, fault.faultResistanceOhms || 0.6);
        conductancesSum += 1 / shortR;
        faultCulpritId = comp.id;
        status = 'SHORT_TO_GND';
      } else if (fault.faultType === 'INTERMITTENT_THERMAL_SHORT' && comp.primaryNetId === net.netId) {
        // Periodic thermal breakdown oscillation every ~4 seconds
        const phase = Math.sin(animTimeSec * 2.2);
        const isShortingNow = phase > -0.25;
        if (isShortingNow) {
          const shortR = Math.max(0.4, fault.faultResistanceOhms || 1.2);
          conductancesSum += 1 / shortR;
          faultCulpritId = comp.id;
          status = 'SHORT_TO_GND';
        }
      }
    });

    const effectiveR = 1 / conductancesSum;
    const isShortedStatus = (status as TelemetryHealthStatus) === 'SHORT_TO_GND';
    const diodeDrop =
      effectiveR < 5
        ? Number((effectiveR * 0.004).toFixed(3))
        : effectiveR < 100
          ? 0.045
          : net.telemetryExpectation.expectedDiodeDropV;

    netSolutions[net.netId] = {
      netId: net.netId,
      actualVoltageDc: net.telemetryExpectation.expectedVoltageDc,
      actualResistanceToGndOhms: Number(effectiveR.toFixed(2)),
      actualDiodeDropV: diodeDrop,
      actualCurrentA: powerConnected ? net.telemetryExpectation.nominalCurrentA : 0,
      status,
      faultCulpritId,
      diagnosticSummary: isShortedStatus
        ? net.telemetryExpectation.diagnosticNotes.shorted
        : net.telemetryExpectation.diagnosticNotes.nominal
    };
  });

  // Step 2: Check series open-line faults (e.g., blown fuse F700 or F800, open coil PL702)
  const f700 = schema.components.F700;
  const f700Blown = f700?.electrical.activeFault?.faultType === 'BLOWN_FUSE_OPEN';

  const f800 = schema.components.F800;
  const f800Blown = f800?.electrical.activeFault?.faultType === 'BLOWN_FUSE_OPEN';

  const pl702 = schema.components.PL702;
  const pl702Open = pl702?.electrical.activeFault?.faultType === 'BLOWN_FUSE_OPEN';

  // Step 3: Propagate DC voltages through the power tree (USB-C -> PPDCIN -> PPVBAT -> PP3V3_G3H & 19V_BACKLIGHT)
  let psuCurrentDrawA = 0.0;
  let psuProtectionTripped = false;

  if (!powerConnected) {
    Object.values(netSolutions).forEach((ns) => {
      ns.actualVoltageDc = 0.0;
      ns.actualCurrentA = 0.0;
    });
  } else {
    // 1. PP20V_USBC_XB
    const usbcNet = netSolutions.PP20V_USBC_XB;
    if (usbcNet) {
      if (usbcNet.actualResistanceToGndOhms < 10) {
        usbcNet.actualVoltageDc = 0.12;
        usbcNet.actualCurrentA = 3.2;
        psuProtectionTripped = true;
      } else {
        // Requires PP3V3_G3H standby to negotiate 20V; if 3V3 is dead, USB-C stays at 5.15V fallback!
        usbcNet.actualVoltageDc = 20.5;
      }
    }

    // 2. PPDCIN_G3H (downstream of F700 and PQ701)
    const dcinNet = netSolutions.PPDCIN_G3H;
    if (dcinNet) {
      if (f700Blown) {
        dcinNet.actualVoltageDc = 0.0;
        dcinNet.actualCurrentA = 0.0;
        dcinNet.status = 'OPEN_LINE';
        dcinNet.faultCulpritId = 'F700';
        dcinNet.diagnosticSummary = schema.netlists.PPDCIN_G3H.telemetryExpectation.diagnosticNotes.open;
        if (usbcNet) {
          // Without PPDCIN_G3H -> PPVBAT -> PP3V3_G3H, USB-C PD controller only gets VBUS 5.18V LDO fallback
          usbcNet.actualVoltageDc = 5.18;
          usbcNet.actualCurrentA = 0.02;
        }
      } else if (dcinNet.actualResistanceToGndOhms < 15) {
        // Short on PPDCIN_G3H pulls rail down and heats the shorted component (e.g. C3108)
        dcinNet.actualVoltageDc = 0.48;
        dcinNet.actualCurrentA = 3.45;
        psuProtectionTripped = true;
        if (dcinNet.faultCulpritId) {
          componentTemperaturesC[dcinNet.faultCulpritId] = 84.6;
          componentTemperaturesC.F700 = 52.1;
          componentTemperaturesC.PQ701 = 56.4;
        }
      } else {
        dcinNet.actualVoltageDc = 20.42;
      }
    }

    // 3. PPVBAT_G3H_CHGR (12.60V regulated by U701 + PL702)
    const vbatNet = netSolutions.PPVBAT_G3H_CHGR;
    if (vbatNet) {
      if (!dcinNet || dcinNet.actualVoltageDc < 8.0 || pl702Open) {
        vbatNet.actualVoltageDc = 0.0;
        vbatNet.actualCurrentA = 0.0;
        if (pl702Open) {
          vbatNet.status = 'OPEN_LINE';
          vbatNet.faultCulpritId = 'PL702';
          vbatNet.diagnosticSummary = schema.netlists.PPVBAT_G3H_CHGR.telemetryExpectation.diagnosticNotes.open;
        } else {
          vbatNet.status = 'UNDERVOLTAGE';
          vbatNet.diagnosticSummary = '0.00V due to missing upstream PPDCIN_G3H supply.';
        }
      } else if (vbatNet.actualResistanceToGndOhms < 15) {
        vbatNet.actualVoltageDc = 0.25;
        vbatNet.actualCurrentA = 2.85;
        if (vbatNet.faultCulpritId) {
          componentTemperaturesC[vbatNet.faultCulpritId] = 79.3;
          componentTemperaturesC.U701 = 61.0;
        }
      } else {
        vbatNet.actualVoltageDc = 12.6;
      }
    }

    // 4. PP3V3_G3H (3.30V standby regulated by U7800 from PPVBAT_G3H_CHGR)
    const g3hNet = netSolutions.PP3V3_G3H;
    if (g3hNet) {
      if (!vbatNet || vbatNet.actualVoltageDc < 5.0) {
        g3hNet.actualVoltageDc = 0.0;
        g3hNet.actualCurrentA = 0.0;
        g3hNet.status = 'UNDERVOLTAGE';
        g3hNet.diagnosticSummary = '0.00V because upstream PPVBAT_G3H_CHGR rail is unpowered.';
      } else if (g3hNet.actualResistanceToGndOhms < 15) {
        // Classic 0.6 Ohm short on PP3V3_G3H (e.g., C704)
        const rShort = g3hNet.actualResistanceToGndOhms;
        g3hNet.actualVoltageDc = Number(Math.min(0.45, rShort * 0.22).toFixed(2));
        g3hNet.actualCurrentA = 1.65;
        g3hNet.status = 'SHORT_TO_GND';
        if (g3hNet.faultCulpritId) {
          componentTemperaturesC[g3hNet.faultCulpritId] = 78.4;
          componentTemperaturesC.U7800 = 64.2;
        }
      } else {
        g3hNet.actualVoltageDc = 3.3;
      }
    }

    // 5. 19V_BACKLIGHT & I2C_BKLT_SDA (including Level 3 Inter-Rail Leakage check!)
    const bkltNet = netSolutions['19V_BACKLIGHT'];
    const sdaNet = netSolutions.I2C_BKLT_SDA;

    // Check if any component has RAIL_TO_DATA_LEAKAGE between 19V_BACKLIGHT and I2C_BKLT_SDA
    let leakingComp: PCBComponentNode | null = null;
    Object.values(schema.components).forEach((comp) => {
      if (comp.electrical.activeFault?.faultType === 'RAIL_TO_DATA_LEAKAGE') {
        leakingComp = comp;
      }
    });

    if (bkltNet && sdaNet) {
      if (!vbatNet || vbatNet.actualVoltageDc < 8.0 || !g3hNet || g3hNet.actualVoltageDc < 2.8) {
        bkltNet.actualVoltageDc = 0.0;
        bkltNet.actualCurrentA = 0.0;
        bkltNet.status = 'UNDERVOLTAGE';
        bkltNet.diagnosticSummary = '0.00V — Backlight boost disabled because standby/system rails are down.';
        sdaNet.actualVoltageDc = 0.0;
        sdaNet.actualCurrentA = 0.0;
        sdaNet.status = 'UNDERVOLTAGE';
      } else if (f800Blown) {
        bkltNet.actualVoltageDc = 0.0;
        bkltNet.actualCurrentA = 0.0;
        bkltNet.status = 'OPEN_LINE';
        bkltNet.faultCulpritId = 'F800';
        bkltNet.diagnosticSummary = schema.netlists['19V_BACKLIGHT'].telemetryExpectation.diagnosticNotes.open;
        sdaNet.actualVoltageDc = 3.28;
      } else if (leakingComp) {
        // Level 3 Fault: 19V_BACKLIGHT leaking into 3.3V I2C_BKLT_SDA line!
        const leakR = (leakingComp as PCBComponentNode).electrical.activeFault?.leakageResistanceOhms || 420;
        // Voltage divider between 19.5V boost and 3.3V pull-up / ESD clamp
        bkltNet.actualVoltageDc = 14.2;
        bkltNet.actualCurrentA = 0.68;
        bkltNet.status = 'RAIL_LEAKAGE';
        bkltNet.faultCulpritId = (leakingComp as PCBComponentNode).id;
        bkltNet.diagnosticSummary = schema.netlists['19V_BACKLIGHT'].telemetryExpectation.diagnosticNotes.leaking;

        sdaNet.actualVoltageDc = 11.84;
        sdaNet.actualResistanceToGndOhms = Number((leakR + 1100).toFixed(0));
        sdaNet.actualDiodeDropV = 0.195;
        sdaNet.actualCurrentA = 0.24;
        sdaNet.status = 'RAIL_LEAKAGE';
        sdaNet.faultCulpritId = (leakingComp as PCBComponentNode).id;
        sdaNet.diagnosticSummary = schema.netlists.I2C_BKLT_SDA.telemetryExpectation.diagnosticNotes.leaking;

        componentTemperaturesC[(leakingComp as PCBComponentNode).id] = 68.5;
        componentTemperaturesC.U800 = 59.2;
        componentTemperaturesC.U5000 = 54.8;
      } else if (bkltNet.actualResistanceToGndOhms < 40) {
        bkltNet.actualVoltageDc = 0.62;
        bkltNet.actualCurrentA = 1.95;
        if (bkltNet.faultCulpritId) {
          componentTemperaturesC[bkltNet.faultCulpritId] = 81.2;
        }
        sdaNet.actualVoltageDc = 3.28;
      } else {
        bkltNet.actualVoltageDc = 19.5;
        sdaNet.actualVoltageDc = 3.28;
      }
    }

    // Compute total PSU input current draw
    if (dcinNet && dcinNet.actualVoltageDc === 0 && f700Blown) {
      psuCurrentDrawA = 0.012;
    } else if (psuProtectionTripped) {
      psuCurrentDrawA = 3.45;
    } else if (g3hNet && g3hNet.status === 'SHORT_TO_GND') {
      psuCurrentDrawA = 0.88;
    } else if (leakingComp) {
      psuCurrentDrawA = 1.92;
    } else {
      psuCurrentDrawA = 1.45;
    }
  }

  return {
    powerConnected,
    psuInputVoltageV: powerConnected ? (psuProtectionTripped ? 5.12 : 20.5) : 0.0,
    psuCurrentDrawA: Number(psuCurrentDrawA.toFixed(3)),
    psuProtectionTripped,
    ambientTempC,
    netSolutions,
    componentTemperaturesC
  };
}

/**
 * Resolves what component or netlist sits at a given 16x16 grid coordinate.
 */
export function resolveGridCellTarget(
  schema: PCBBoardSchema,
  row: number,
  col: number
): { targetId: string; label: string; netId: string; component: PCBComponentNode | null } {
  const cellVal = schema.gridLayout[row]?.[col] || 'sub_fr4_emerald';
  const comp = schema.components[cellVal] || null;
  if (comp) {
    return {
      targetId: comp.id,
      label: comp.label,
      netId: comp.primaryNetId,
      component: comp
    };
  }

  // Check if this coordinate lies on a routed copper netlist
  for (const net of Object.values(schema.netlists)) {
    if (net.routedCells.some((rc) => rc.row === row && rc.col === col)) {
      return {
        targetId: `${net.netId}_TRACE`,
        label: `${net.label} Copper Trace`,
        netId: net.netId,
        component: null
      };
    }
  }

  if (cellVal === 'sub_gnd_pour') {
    return {
      targetId: 'GND_PLANE',
      label: 'Copper Ground Return Pour',
      netId: 'GND',
      component: null
    };
  }

  return {
    targetId: `FR4_R${row}C${col}`,
    label: 'FR-4 Solder Mask Dielectric (Isolated)',
    netId: 'ISOLATED',
    component: null
  };
}

/**
 * Computes the exact Digital Multimeter (DMM) measurement between the Red Probe
 * and Black Probe on the 2:1 dimetric 3D board, including parasitic trace milliohms
 * so technicians can pinpoint the exact shorted component along a common rail.
 */
export function evaluateProbeMeasurement(
  schema: PCBBoardSchema,
  solution: BoardElectricalSolution,
  mode: MultimeterMode,
  redCoord: { row: number; col: number },
  blackCoord: { row: number; col: number }
): ProbeMeasurementResult {
  const redTarget = resolveGridCellTarget(schema, redCoord.row, redCoord.col);
  const blackTarget = resolveGridCellTarget(schema, blackCoord.row, blackCoord.col);

  const redNet = schema.netlists[redTarget.netId];
  const redSolved = solution.netSolutions[redTarget.netId];
  const blackSolved = solution.netSolutions[blackTarget.netId];

  // Calculate Manhattan grid distance from red probe to the actual fault culprit on that net
  // (models realistic 1oz copper trace resistance ~15 mΩ per grid square!)
  let traceParasiticOhms = 0.0;
  if (redSolved?.faultCulpritId && schema.components[redSolved.faultCulpritId]) {
    const culpritBbox = schema.components[redSolved.faultCulpritId].bbox;
    const dist = Math.abs(redCoord.row - culpritBbox.row) + Math.abs(redCoord.col - culpritBbox.col);
    traceParasiticOhms = dist * 0.035;
  }

  // Thermal Spot Probe Mode
  if (mode === 'THERMAL_TEMP') {
    const compTemp = redTarget.component
      ? solution.componentTemperaturesC[redTarget.component.id] ?? solution.ambientTempC
      : solution.ambientTempC + (redSolved?.status === 'SHORT_TO_GND' ? 6.5 : 0.4);
    const isHot = compTemp > 48.0;
    return {
      mode,
      redProbe: { ...redCoord, targetId: redTarget.targetId, netId: redTarget.netId },
      blackProbe: { ...blackCoord, targetId: blackTarget.targetId, netId: blackTarget.netId },
      displayValue: compTemp.toFixed(1),
      unit: '°C',
      numericValue: compTemp,
      expectedValueText: '24.0 °C – 36.0 °C nominal operating temperature',
      status: isHot ? (redSolved?.status || 'SHORT_TO_GND') : 'NOMINAL',
      verdictTitle: isHot
        ? `THERMAL HOTSPOT DETECTED (${compTemp.toFixed(1)} °C on ${redTarget.targetId})`
        : `Normal Surface Temperature (${compTemp.toFixed(1)} °C)`,
      verdictDetail: isHot
        ? `${redTarget.targetId} is dissipating abnormal Joule heat! This strongly implicates ${redTarget.targetId} as the fault source.`
        : `Surface temperature at ${redTarget.targetId} is within normal thermal envelope.`,
      continuityBeep: isHot
    };
  }

  // If probing isolated FR-4 solder mask
  if (redTarget.netId === 'ISOLATED') {
    return {
      mode,
      redProbe: { ...redCoord, targetId: redTarget.targetId, netId: redTarget.netId },
      blackProbe: { ...blackCoord, targetId: blackTarget.targetId, netId: blackTarget.netId },
      displayValue: mode === 'VOLTAGE_DC' ? '0.000' : 'OL',
      unit: mode === 'VOLTAGE_DC' ? 'V DC' : mode === 'RESISTANCE_OHM' ? 'Ω' : 'V',
      numericValue: 0,
      expectedValueText: 'Select a component pad, gold test point, or copper trace',
      status: 'NOMINAL',
      verdictTitle: 'Probe on Insulated Solder Mask',
      verdictDetail: 'Move the Red (+) probe onto a component pin, test point (TP_*), or copper trace.',
      continuityBeep: false
    };
  }

  // Mode 1: DC Voltage
  if (mode === 'VOLTAGE_DC') {
    const vRed = redSolved ? redSolved.actualVoltageDc : 0.0;
    const vBlack = blackSolved ? blackSolved.actualVoltageDc : 0.0;
    const vDiff = vRed - vBlack;
    const expV = redNet ? redNet.telemetryExpectation.expectedVoltageDc : 0.0;
    const tolV = redNet ? redNet.telemetryExpectation.voltageToleranceV : 0.5;
    const status = !solution.powerConnected ? 'UNDERVOLTAGE' : redSolved ? redSolved.status : 'NOMINAL';

    return {
      mode,
      redProbe: { ...redCoord, targetId: redTarget.targetId, netId: redTarget.netId },
      blackProbe: { ...blackCoord, targetId: blackTarget.targetId, netId: blackTarget.netId },
      displayValue: vDiff.toFixed(2),
      unit: 'V DC',
      numericValue: vDiff,
      expectedValueText: `${expV.toFixed(2)}V ± ${tolV.toFixed(2)}V (Ref GND)`,
      status,
      verdictTitle: !solution.powerConnected
        ? 'Board Unpowered (0.00V)'
        : status === 'NOMINAL'
          ? `Nominal Rail Voltage (${vDiff.toFixed(2)}V on ${redTarget.netId})`
          : `Abnormal Rail Voltage (${vDiff.toFixed(2)}V vs ${expV.toFixed(2)}V expected)`,
      verdictDetail: !solution.powerConnected
        ? 'Enable USB-C 20V Power in the top toolbar to measure live DC rail voltages, or switch to Resistance (Ω) mode.'
        : redSolved?.diagnosticSummary || 'Rail voltage within expected tolerance.',
      continuityBeep: false
    };
  }

  // Mode 2: Resistance to Ground (Ohms)
  if (mode === 'RESISTANCE_OHM') {
    // Check if probing directly across a blown series fuse (Red on one side, Black on the other)
    if (
      (redTarget.targetId === 'F700' || redTarget.netId === 'PPDCIN_G3H') &&
      blackTarget.netId === 'PP20V_USBC_XB' &&
      schema.components.F700?.electrical.activeFault?.faultType === 'BLOWN_FUSE_OPEN'
    ) {
      return {
        mode,
        redProbe: { ...redCoord, targetId: redTarget.targetId, netId: redTarget.netId },
        blackProbe: { ...blackCoord, targetId: blackTarget.targetId, netId: blackTarget.netId },
        displayValue: 'OL (OPEN)',
        unit: 'MΩ',
        numericValue: 9999999,
        expectedValueText: '0.04 Ω across healthy F700 fuse',
        status: 'OPEN_LINE',
        verdictTitle: 'OPEN CIRCUIT ACROSS FUSE F700',
        verdictDetail: 'F700 measures OL (Open Line) between PP20V_USBC_XB and PPDCIN_G3H. Fuse F700 is blown!',
        continuityBeep: false
      };
    }

    const rawOhms = (redSolved ? redSolved.actualResistanceToGndOhms : 999999) + traceParasiticOhms;
    const expOhms = redNet ? redNet.telemetryExpectation.expectedResistanceToGndOhms : 10000;
    const formatted =
      rawOhms >= 1000
        ? `${(rawOhms / 1000).toFixed(2)} kΩ`
        : `${rawOhms.toFixed(2)} Ω`;
    const expFormatted =
      expOhms >= 1000
        ? `${(expOhms / 1000).toFixed(1)} kΩ`
        : `${expOhms.toFixed(2)} Ω`;

    const isShort = redTarget.netId !== 'GND' && rawOhms < (redNet?.telemetryExpectation.shortThresholdOhms || 30);
    const isCulpritCell = redSolved?.faultCulpritId === redTarget.targetId;

    return {
      mode,
      redProbe: { ...redCoord, targetId: redTarget.targetId, netId: redTarget.netId },
      blackProbe: { ...blackCoord, targetId: blackTarget.targetId, netId: blackTarget.netId },
      displayValue: rawOhms >= 1000 ? (rawOhms / 1000).toFixed(2) : rawOhms.toFixed(2),
      unit: rawOhms >= 1000 ? 'kΩ' : 'Ω',
      numericValue: rawOhms,
      expectedValueText: `${expFormatted} to GND`,
      status: isShort ? 'SHORT_TO_GND' : redSolved?.status || 'NOMINAL',
      verdictTitle: isShort
        ? isCulpritCell
          ? `LOWEST RESISTANCE POINT (${formatted}) AT ${redTarget.targetId}!`
          : `Low Resistance Short (${formatted}) on ${redTarget.netId}`
        : `Nominal Resistance (${formatted} on ${redTarget.netId})`,
      verdictDetail: isShort
        ? isCulpritCell
          ? `Zero parasitic trace offset (${rawOhms.toFixed(2)} Ω) confirms ${redTarget.targetId} is the exact shorted component on ${redTarget.netId}.`
          : `Rail ${redTarget.netId} is shorted to ground (${formatted} includes +${(traceParasiticOhms * 1000).toFixed(0)} mΩ copper trace drop). Probe components along ${redTarget.netId} to find the lowest Ω reading.`
        : redSolved?.diagnosticSummary || 'Impedance to ground matches nominal schematic signature.',
      continuityBeep: rawOhms < 25
    };
  }

  // Mode 3: Diode Mode Voltage Drop
  const diodeV = (redSolved ? redSolved.actualDiodeDropV : 0.45) + traceParasiticOhms * 0.01;
  const expDiodeV = redNet ? redNet.telemetryExpectation.expectedDiodeDropV : 0.45;
  const isFaultyDiode =
    redTarget.netId !== 'GND' && Math.abs(diodeV - expDiodeV) > 0.14;

  return {
    mode,
    redProbe: { ...redCoord, targetId: redTarget.targetId, netId: redTarget.netId },
    blackProbe: { ...blackCoord, targetId: blackTarget.targetId, netId: blackTarget.netId },
    displayValue: diodeV.toFixed(3),
    unit: 'V Diode',
    numericValue: diodeV,
    expectedValueText: `${expDiodeV.toFixed(3)}V diode drop (Red on GND)`,
    status: isFaultyDiode ? redSolved?.status || 'SHORT_TO_GND' : 'NOMINAL',
    verdictTitle: isFaultyDiode
      ? `Abnormal Diode Junction Drop (${diodeV.toFixed(3)}V on ${redTarget.netId})`
      : `Nominal Silicon Junction Signature (${diodeV.toFixed(3)}V)`,
    verdictDetail:
      redSolved?.diagnosticSummary ||
      `Diode drop on ${redTarget.netId} matches healthy reference board (${expDiodeV.toFixed(3)}V).`,
    continuityBeep: diodeV < 0.04
  };
}
