/**
 * @file pcbSchema.ts
 * @description Production-grade JSON Schema & Type System for the 2:1 Dimetric 3D PCB Digital Twin.
 * Captures physical 3D isometric bounding boxes, SMD/QFN/BGA package geometry, pin arrays,
 * logical electrical netlists, copper trace routing, and expected diagnostic telemetry.
 */

export type PackageFootprintType =
  | 'SUBSTRATE_FR4'
  | 'SUBSTRATE_GND_PLANE'
  | 'TRACE_H'
  | 'TRACE_V'
  | 'TRACE_CORNER_NE'
  | 'TRACE_CORNER_NW'
  | 'TRACE_CORNER_SE'
  | 'TRACE_CORNER_SW'
  | 'TRACE_TEE'
  | 'TRACE_CROSS'
  | 'VIA_PLATED'
  | 'TP_GOLD'
  | '0402_CAP'
  | '0402_RES'
  | '0603_FUSE'
  | '0805_CAP'
  | 'SOD_323_DIODE'
  | 'SOT_23_3'
  | 'SOIC_8_MOSFET'
  | 'QFN_32_IC'
  | 'BGA_96_SOC'
  | 'IND_7070_SHIELDED'
  | 'CONN_USBC_24'
  | 'CONN_EDP_30'
  | 'MOUNT_HOLE_GND';

export type ComponentCategory =
  | 'ic'
  | 'power'
  | 'passive'
  | 'protection'
  | 'connector'
  | 'trace'
  | 'substrate';

export interface IsometricBoundingBox3D {
  /** Grid row index (0..15) in 2:1 dimetric isometric space */
  row: number;
  /** Grid column index (0..15) in 2:1 dimetric isometric space */
  col: number;
  /** Physical width in mm */
  widthMm: number;
  /** Physical length in mm */
  lengthMm: number;
  /** Physical extruded 3D height in mm */
  heightMm: number;
  /** Isometric rotation in degrees (0, 90, 180, 270) */
  rotationDeg: 0 | 90 | 180 | 270;
}

export interface PCBPinNode {
  /** Pin number or pad identifier (e.g., "1", "2", "VIN", "GND", "EPAD") */
  pinId: string;
  /** Human-readable pin function (e.g., "PPDCIN_G3H_IN", "SW_PHASE_1", "I2C_SDA") */
  name: string;
  /** Connected logical netlist ID */
  netId: string;
  /** Local offset within the 128x128 isometric tile for precise probe snapping */
  isoOffset: { dx: number; dy: number };
  /** Nominal silicon junction forward voltage drop in Diode Mode (Red on GND) */
  nominalDiodeDropV: number;
}

export interface ComponentElectricalParams {
  /** Nominal parallel resistance to ground contribution (Ohms) */
  internalResistanceToGndOhms: number;
  /** Series resistance between Pin 1 and Pin 2 for series pass elements (fuses, inductors, resistors) */
  seriesResistanceOhms: number;
  /** Capacitance in microfarads (for MLCC/tantalum capacitors) */
  capacitanceUf?: number;
  /** Inductance in microhenries (for power coils) */
  inductanceUh?: number;
  /** Voltage regulation target if active regulator IC */
  regulatedOutputV?: number;
  /** Current limit / fuse rating in Amperes */
  currentRatingA?: number;
  /** Fault state injected by the Fault Sandbox Engine */
  activeFault?: {
    faultType:
      | 'NONE'
      | 'DEAD_SHORT_GND'
      | 'BLOWN_FUSE_OPEN'
      | 'INTERMITTENT_THERMAL_SHORT'
      | 'RAIL_TO_DATA_LEAKAGE'
      | 'HIGH_RESISTANCE_JOINT';
    faultResistanceOhms: number;
    leakingIntoNetId?: string;
    leakageResistanceOhms?: number;
    intermittentDutyCycle?: number;
  };
}

export interface PCBComponentNode {
  /** Canonical schematic designator (e.g., "U701", "PL702", "C704", "F700") */
  id: string;
  /** Tile brush archetype ID matching the 2:1 dimetric isometric palette */
  tileTypeId: string;
  /** Descriptive title (e.g., "ISL9240 Buck-Boost Controller") */
  label: string;
  /** Part number / value specification (e.g., "10uF 25V X5R", "3A 32V Fast-Acting") */
  partSpec: string;
  /** Package footprint classification */
  packageType: PackageFootprintType;
  /** Palette filter category */
  category: ComponentCategory;
  /** Physical 3D bounding box on the isometric board */
  bbox: IsometricBoundingBox3D;
  /** Ordered array of physical pins/pads and their netlist bindings */
  pins: PCBPinNode[];
  /** Primary netlist ID for quick trace/component highlighting */
  primaryNetId: string;
  /** Secondary netlist ID (for 2-terminal series components bridging two nets) */
  secondaryNetId?: string;
  /** Electrical simulation parameters */
  electrical: ComponentElectricalParams;
  /** Engineering documentation for repair training */
  doc: string;
}

export interface DiagnosticExpectation {
  /** Expected DC voltage when board power is connected (Volts) */
  expectedVoltageDc: number;
  /** Acceptable voltage tolerance (+/- Volts) */
  voltageToleranceV: number;
  /** Expected resistance to GND when unpowered (Ohms) */
  expectedResistanceToGndOhms: number;
  /** Minimum healthy resistance threshold before flagging a short/low-Z fault */
  shortThresholdOhms: number;
  /** Expected diode mode voltage drop (Red probe on GND, Black probe on rail) */
  expectedDiodeDropV: number;
  /** Expected continuous standby/active current on this rail (Amps) */
  nominalCurrentA: number;
  /** Diagnostic interpretation notes for trainees */
  diagnosticNotes: {
    nominal: string;
    shorted: string;
    open: string;
    leaking: string;
  };
  /** Recommended physical test point coordinates on the 16x16 grid */
  recommendedProbePoint: { row: number; col: number; designator: string };
}

export interface PCBNetRail {
  /** Canonical netlist identifier (e.g., "PP20V_USBC_XB", "PPDCIN_G3H", "PP3V3_G3H", "19V_BACKLIGHT") */
  netId: string;
  /** Human-readable net name */
  label: string;
  /** Rail classification */
  railClass: 'POWER_PRIMARY' | 'POWER_STANDBY' | 'POWER_BOOST' | 'DATA_BUS' | 'SWITCH_NODE' | 'GROUND';
  /** Highlight color in hex for 3D netlist raycast propagation */
  highlightColor: string;
  /** Ordered list of grid coordinates [row, col] belonging to this copper netlist */
  routedCells: Array<{ row: number; col: number; layer: 'TOP_COPPER' | 'INNER_L2_PWR' | 'BOTTOM_GND' }>;
  /** Linked component designators attached to this net */
  connectedComponents: string[];
  /** Diagnostic telemetry expectations for "Test Mode" */
  telemetryExpectation: DiagnosticExpectation;
}

export interface PCBBoardSchema {
  schemaVersion: '2.1.0-DIMETRIC-CAD';
  boardId: string;
  boardTitle: string;
  boardRevision: string;
  dimensions: {
    rows: number;
    cols: number;
    pitchMm: number;
    layerCount: number;
  };
  netlists: Record<string, PCBNetRail>;
  components: Record<string, PCBComponentNode>;
  /** 16x16 matrix mapping each cell to either a component designator or a substrate/trace tile ID */
  gridLayout: string[][];
}

export interface PaletteTileDefinition {
  id: string;
  code: string;
  label: string;
  category: ComponentCategory;
  packageType: PackageFootprintType;
  defaultNetId: string;
  doc: string;
}

/**
 * Complete catalog of 2:1 dimetric 3D isometric electronics & PCB tiles
 * used across the palette tray and procedural sprite generator.
 */
export const PCB_PALETTE_TILES: PaletteTileDefinition[] = [
  // Power & Controller ICs
  {
    id: 'ic_u3100_cd3217',
    code: 'U3100',
    label: 'CD3217B12 USB-C PD Controller',
    category: 'ic',
    packageType: 'BGA_96_SOC',
    defaultNetId: 'PP20V_USBC_XB',
    doc: '96-ball BGA USB-C Power Delivery controller negotiating 20V 3.25A contract and driving CC1/CC2.'
  },
  {
    id: 'ic_u701_isl9240',
    code: 'U701',
    label: 'ISL9240 Buck-Boost PMIC',
    category: 'ic',
    packageType: 'QFN_32_IC',
    defaultNetId: 'PPVBAT_G3H_CHGR',
    doc: '32-pin QFN system power charger & PPVBAT_G3H buck-boost regulator controller.'
  },
  {
    id: 'ic_u7800_pmic_g3h',
    code: 'U7800',
    label: 'TPS51980 3.3V/5V G3H LDO IC',
    category: 'ic',
    packageType: 'QFN_32_IC',
    defaultNetId: 'PP3V3_G3H',
    doc: 'Always-on 3.3V standby rail regulator supplying EC and USB-C PD logic.'
  },
  {
    id: 'ic_u800_lp8550',
    code: 'U800',
    label: 'LP8550 eDP Backlight Driver',
    category: 'ic',
    packageType: 'BGA_96_SOC',
    defaultNetId: '19V_BACKLIGHT',
    doc: 'High-efficiency LED backlight boost controller with I2C brightness control (I2C_BKLT_SDA/SCL).'
  },
  {
    id: 'ic_u5000_ec_it8987',
    code: 'U5000',
    label: 'IT8987E Embedded Controller',
    category: 'ic',
    packageType: 'QFN_32_IC',
    defaultNetId: 'PP3V3_G3H',
    doc: 'System Management & Embedded Controller monitoring power rails and asserting BKLT_EN.'
  },

  // Inductors & MOSFETs (Power Stage)
  {
    id: 'pwr_pl702_inductor',
    code: 'PL702',
    label: '2.2uH 12A Shielded Buck Coil',
    category: 'power',
    packageType: 'IND_7070_SHIELDED',
    defaultNetId: 'PPVBAT_G3H_CHGR',
    doc: 'High-current molded power inductor coupling U701 switching phase to PPVBAT_G3H_CHGR.'
  },
  {
    id: 'pwr_pl801_boost_coil',
    code: 'PL801',
    label: '10uH 4.5A Backlight Boost Coil',
    category: 'power',
    packageType: 'IND_7070_SHIELDED',
    defaultNetId: '19V_BACKLIGHT',
    doc: 'Step-up switching inductor boosting PPVBAT_G3H (12.6V) to 19.5V-28V eDP LED backlight rail.'
  },
  {
    id: 'pwr_pq701_mosfet',
    code: 'PQ701',
    label: 'AON7408 Dual N-Ch MOSFET',
    category: 'power',
    packageType: 'SOIC_8_MOSFET',
    defaultNetId: 'PPDCIN_G3H',
    doc: 'Input reverse-blocking & inrush protection power MOSFET between USB-C 20V and PPDCIN_G3H.'
  },
  {
    id: 'pwr_q8501_bklt_sw',
    code: 'Q8501',
    label: 'SOT-23 Backlight Gate Switch',
    category: 'power',
    packageType: 'SOT_23_3',
    defaultNetId: '19V_BACKLIGHT',
    doc: '3-pin SOT-23 level-shifting transistor isolating 19V_BACKLIGHT enable from 3.3V logic.'
  },
  {
    id: 'pwr_d801_schottky',
    code: 'D801',
    label: '40V 2A Schottky Boost Diode',
    category: 'power',
    packageType: 'SOD_323_DIODE',
    defaultNetId: '19V_BACKLIGHT',
    doc: 'Fast-recovery Schottky rectifier diode on the 19V_BACKLIGHT boost output rail.'
  },

  // Protection & Fuses
  {
    id: 'prot_f700_fuse',
    code: 'F700',
    label: '3.0A 32V 0603 Main Input Fuse',
    category: 'protection',
    packageType: '0603_FUSE',
    defaultNetId: 'PPDCIN_G3H',
    doc: 'Primary 0603 fast-acting ceramic fuse protecting PPDCIN_G3H from downstream overcurrent.'
  },
  {
    id: 'prot_f800_bklt_fuse',
    code: 'F800',
    label: '2.0A 24V Backlight Output Fuse',
    category: 'protection',
    packageType: '0603_FUSE',
    defaultNetId: '19V_BACKLIGHT',
    doc: 'Dedicated 0603 fuse on the eDP backlight power feed to connector J8500.'
  },

  // Passives (MLCC Capacitors & Precision Sense Resistors)
  {
    id: 'pas_c704_mlcc',
    code: 'C704',
    label: '10uF 6.3V 0402 Decoupling MLCC',
    category: 'passive',
    packageType: '0402_CAP',
    defaultNetId: 'PP3V3_G3H',
    doc: 'Multi-layer ceramic capacitor filtering PP3V3_G3H standby output. Prone to hairline crack shorts.'
  },
  {
    id: 'pas_c3108_mlcc',
    code: 'C3108',
    label: '4.7uF 25V 0805 Input Bulk MLCC',
    category: 'passive',
    packageType: '0805_CAP',
    defaultNetId: 'PPDCIN_G3H',
    doc: 'High-voltage 0805 ceramic decoupling capacitor on the 20V PPDCIN_G3H main bus.'
  },
  {
    id: 'pas_c8512_bklt_cap',
    code: 'C8512',
    label: '2.2uF 50V 0805 Backlight MLCC',
    category: 'passive',
    packageType: '0805_CAP',
    defaultNetId: '19V_BACKLIGHT',
    doc: '50V rated output filter capacitor on 19V_BACKLIGHT adjacent to I2C_BKLT_SDA trace.'
  },
  {
    id: 'pas_r702_shunt',
    code: 'R702',
    label: '10mOhm 1% Current Sense Shunt',
    category: 'passive',
    packageType: '0402_RES',
    defaultNetId: 'PPVBAT_G3H_CHGR',
    doc: 'Kelvin-connected current-sense resistor measuring total system charger current.'
  },
  {
    id: 'pas_r5012_pullup',
    code: 'R5012',
    label: '2.2kOhm 0402 I2C Pull-Up',
    category: 'passive',
    packageType: '0402_RES',
    defaultNetId: 'I2C_BKLT_SDA',
    doc: 'Pull-up resistor biasing I2C_BKLT_SDA data line to PP3V3_G3H (3.30V nominal).'
  },

  // Connectors & Test Points
  {
    id: 'conn_j3300_usbc',
    code: 'J3300',
    label: '24-Pin USB-C Thunderbolt Port',
    category: 'connector',
    packageType: 'CONN_USBC_24',
    defaultNetId: 'PP20V_USBC_XB',
    doc: 'Reversible 24-pin USB Type-C receptacle supplying VBUS (5V->20.5V PD) and CC1/CC2.'
  },
  {
    id: 'conn_j8500_edp',
    code: 'J8500',
    label: '30-Pin eDP Display Receptacle',
    category: 'connector',
    packageType: 'CONN_EDP_30',
    defaultNetId: '19V_BACKLIGHT',
    doc: 'Fine-pitch gold-plated eDP LCD & Backlight connector carrying 19V_BACKLIGHT, 3.3V, and I2C.'
  },
  {
    id: 'tp_gold_probe_pad',
    code: 'TP-PAD',
    label: 'ENIG Gold Surface Test Point',
    category: 'connector',
    packageType: 'TP_GOLD',
    defaultNetId: 'PP3V3_G3H',
    doc: 'Exposed 1.2mm electroless nickel immersion gold (ENIG) diagnostic test target pad.'
  },
  {
    id: 'mnt_gnd_standoff',
    code: 'GND-MNT',
    label: 'Plated Chassis Ground Standoff',
    category: 'connector',
    packageType: 'MOUNT_HOLE_GND',
    defaultNetId: 'GND',
    doc: '8-via stitched brass/tin plated mounting ring tied directly to reference ground plane (0.00V).'
  },

  // Copper Traces & Substrate
  {
    id: 'tr_copper_h',
    code: 'TR-EW',
    label: '1oz Copper Trace (NW-SE Axis)',
    category: 'trace',
    packageType: 'TRACE_H',
    defaultNetId: 'PPDCIN_G3H',
    doc: 'Top-layer 1oz copper power/signal trace under emerald LPI solder mask.'
  },
  {
    id: 'tr_copper_v',
    code: 'TR-NS',
    label: '1oz Copper Trace (NE-SW Axis)',
    category: 'trace',
    packageType: 'TRACE_V',
    defaultNetId: 'PP3V3_G3H',
    doc: 'Orthogonal top-layer copper interconnect trace segment.'
  },
  {
    id: 'tr_copper_tee',
    code: 'TR-JCT',
    label: 'Copper Netlist Branch Junction',
    category: 'trace',
    packageType: 'TRACE_TEE',
    defaultNetId: 'PPVBAT_G3H_CHGR',
    doc: '3-way impedance-matched copper netlist branch node.'
  },
  {
    id: 'tr_via_stitched',
    code: 'VIA-TH',
    label: 'Through-Hole Layer Via Pair',
    category: 'trace',
    packageType: 'VIA_PLATED',
    defaultNetId: 'PP3V3_G3H',
    doc: 'Laser-drilled plated micro-via transitioning signal between L1 Top Copper and L2 Power Plane.'
  },
  {
    id: 'sub_fr4_emerald',
    code: 'FR4-EM',
    label: 'FR-4 Solder Mask Substrate',
    category: 'substrate',
    packageType: 'SUBSTRATE_FR4',
    defaultNetId: 'GND',
    doc: '8-layer high-Tg FR-4 dielectric substrate with matte emerald solder mask finish.'
  },
  {
    id: 'sub_gnd_pour',
    code: 'GND-CU',
    label: 'Crosshatched Copper GND Pour',
    category: 'substrate',
    packageType: 'SUBSTRATE_GND_PLANE',
    defaultNetId: 'GND',
    doc: 'Shielded ground return plane with thermal-relief via stitching.'
  }
];

/**
 * Generates the default production-grade 16x16 PCB Digital Twin Schema
 * ("820-01987-A Logic Board — USB-C PD, 3.3V G3H & 19V eDP Backlight Subsystem").
 */
export function createDefaultPCBBoardSchema(): PCBBoardSchema {
  const ROWS = 16;
  const COLS = 16;

  // Initialize 16x16 FR-4 substrate with perimeter ground pours
  const gridLayout: string[][] = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (__, c) => {
      if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
        return 'sub_gnd_pour';
      }
      return 'sub_fr4_emerald';
    })
  );

  // Corner chassis ground mounting holes
  gridLayout[1][1] = 'GND_M1';
  gridLayout[1][14] = 'GND_M2';
  gridLayout[14][1] = 'GND_M3';
  gridLayout[14][14] = 'GND_M4';

  // Logical Netlists Definition
  const netlists: Record<string, PCBNetRail> = {
    GND: {
      netId: 'GND',
      label: 'GND (0.0V Chassis Reference)',
      railClass: 'GROUND',
      highlightColor: '#38bdf8',
      routedCells: [
        { row: 1, col: 1, layer: 'BOTTOM_GND' },
        { row: 1, col: 14, layer: 'BOTTOM_GND' },
        { row: 14, col: 1, layer: 'BOTTOM_GND' },
        { row: 14, col: 14, layer: 'BOTTOM_GND' }
      ],
      connectedComponents: ['GND_M1', 'GND_M2', 'GND_M3', 'GND_M4', 'C3108', 'C704', 'C8512', 'U3100', 'U701', 'U7800', 'U800', 'U5000'],
      telemetryExpectation: {
        expectedVoltageDc: 0.0,
        voltageToleranceV: 0.02,
        expectedResistanceToGndOhms: 0.08,
        shortThresholdOhms: 0.0,
        expectedDiodeDropV: 0.0,
        nominalCurrentA: 0.0,
        diagnosticNotes: {
          nominal: '0.00V / 0.08 Ω reference ground return plane. Place black COM probe here.',
          shorted: 'Reference ground is naturally 0 Ω to chassis.',
          open: 'Ground continuity fault — check mounting standoffs.',
          leaking: 'Ground bounce detected.'
        },
        recommendedProbePoint: { row: 14, col: 1, designator: 'GND_M3' }
      }
    },
    PP20V_USBC_XB: {
      netId: 'PP20V_USBC_XB',
      label: 'PP20V_USBC_XB (USB-C VBUS Input)',
      railClass: 'POWER_PRIMARY',
      highlightColor: '#f59e0b',
      routedCells: [
        { row: 3, col: 2, layer: 'TOP_COPPER' },
        { row: 3, col: 3, layer: 'TOP_COPPER' },
        { row: 3, col: 4, layer: 'TOP_COPPER' },
        { row: 3, col: 5, layer: 'TOP_COPPER' }
      ],
      connectedComponents: ['J3300', 'U3100', 'TP_USBC_20V', 'PQ701'],
      telemetryExpectation: {
        expectedVoltageDc: 20.5,
        voltageToleranceV: 0.6,
        expectedResistanceToGndOhms: 48500,
        shortThresholdOhms: 50,
        expectedDiodeDropV: 0.512,
        nominalCurrentA: 1.45,
        diagnosticNotes: {
          nominal: '20.50V continuous PD contract negotiated by U3100 (CD3217).',
          shorted: 'Short on USB-C VBUS input; adapter will fold back to 0V protection mode.',
          open: 'No 20V negotiation — inspect J3300 USB-C pins or U3100 LDO rails.',
          leaking: 'Abnormal VBUS voltage sag.'
        },
        recommendedProbePoint: { row: 2, col: 4, designator: 'TP_USBC_20V' }
      }
    },
    PPDCIN_G3H: {
      netId: 'PPDCIN_G3H',
      label: 'PPDCIN_G3H (Protected 20V Main Bus)',
      railClass: 'POWER_PRIMARY',
      highlightColor: '#ef4444',
      routedCells: [
        { row: 3, col: 6, layer: 'TOP_COPPER' },
        { row: 3, col: 7, layer: 'TOP_COPPER' },
        { row: 3, col: 8, layer: 'TOP_COPPER' },
        { row: 4, col: 8, layer: 'TOP_COPPER' },
        { row: 5, col: 8, layer: 'TOP_COPPER' }
      ],
      connectedComponents: ['PQ701', 'F700', 'C3108', 'TP_DCIN_FUSE', 'U701'],
      telemetryExpectation: {
        expectedVoltageDc: 20.42,
        voltageToleranceV: 0.6,
        expectedResistanceToGndOhms: 39200,
        shortThresholdOhms: 40,
        expectedDiodeDropV: 0.468,
        nominalCurrentA: 1.45,
        diagnosticNotes: {
          nominal: '20.42V continuous primary supply rail downstream of F700 (3A fuse) and PQ701.',
          shorted: '< 10 Ω to ground indicates a shorted input MLCC capacitor (check C3108) or shorted U701 high-side FET.',
          open: '0.00V with OL / high-Z after F700 while PP20V_USBC_XB is 20.5V indicates blown fuse F700.',
          leaking: 'Voltage drop across F700/PQ701 exceeds specification.'
        },
        recommendedProbePoint: { row: 2, col: 7, designator: 'TP_DCIN_FUSE' }
      }
    },
    PPVBAT_G3H_CHGR: {
      netId: 'PPVBAT_G3H_CHGR',
      label: 'PPVBAT_G3H_CHGR (12.60V System Bus)',
      railClass: 'POWER_PRIMARY',
      highlightColor: '#ec4899',
      routedCells: [
        { row: 6, col: 8, layer: 'TOP_COPPER' },
        { row: 7, col: 8, layer: 'TOP_COPPER' },
        { row: 8, col: 8, layer: 'TOP_COPPER' },
        { row: 8, col: 9, layer: 'TOP_COPPER' },
        { row: 8, col: 10, layer: 'TOP_COPPER' },
        { row: 8, col: 6, layer: 'TOP_COPPER' },
        { row: 8, col: 5, layer: 'TOP_COPPER' }
      ],
      connectedComponents: ['U701', 'PL702', 'R702', 'TP_PPVBAT', 'U7800', 'PL801'],
      telemetryExpectation: {
        expectedVoltageDc: 12.6,
        voltageToleranceV: 0.35,
        expectedResistanceToGndOhms: 18400,
        shortThresholdOhms: 25,
        expectedDiodeDropV: 0.425,
        nominalCurrentA: 2.1,
        diagnosticNotes: {
          nominal: '12.60V regulated system bus generated by U701 & PL702 buck-boost stage.',
          shorted: 'Dead short on main system rail PPVBAT_G3H_CHGR.',
          open: '0.00V on PPVBAT_G3H_CHGR — check upstream PPDCIN_G3H fuse F700 or coil PL702.',
          leaking: 'Unstable PPVBAT switching ripple.'
        },
        recommendedProbePoint: { row: 7, col: 9, designator: 'TP_PPVBAT' }
      }
    },
    PP3V3_G3H: {
      netId: 'PP3V3_G3H',
      label: 'PP3V3_G3H (3.30V Always-On Standby)',
      railClass: 'POWER_STANDBY',
      highlightColor: '#10b981',
      routedCells: [
        { row: 9, col: 5, layer: 'TOP_COPPER' },
        { row: 10, col: 5, layer: 'TOP_COPPER' },
        { row: 11, col: 5, layer: 'TOP_COPPER' },
        { row: 11, col: 4, layer: 'TOP_COPPER' },
        { row: 11, col: 6, layer: 'TOP_COPPER' },
        { row: 11, col: 7, layer: 'TOP_COPPER' }
      ],
      connectedComponents: ['U7800', 'C704', 'TP_3V3_G3H', 'U5000', 'R5012', 'U3100'],
      telemetryExpectation: {
        expectedVoltageDc: 3.3,
        voltageToleranceV: 0.1,
        expectedResistanceToGndOhms: 14200,
        shortThresholdOhms: 15,
        expectedDiodeDropV: 0.382,
        nominalCurrentA: 0.18,
        diagnosticNotes: {
          nominal: '3.30V continuous standby rail required for U5000 EC boot and USB-C PD logic.',
          shorted: '0.6 Ω to ground indicates a dead short on PP3V3_G3H (inspect decoupling MLCC C704 with Thermal IR).',
          open: 'Missing 3.3V standby rail — verify PPVBAT_G3H_CHGR input to U7800.',
          leaking: 'Overvoltage on 3.3V rail from leaking higher-voltage domain.'
        },
        recommendedProbePoint: { row: 10, col: 4, designator: 'TP_3V3_G3H' }
      }
    },
    '19V_BACKLIGHT': {
      netId: '19V_BACKLIGHT',
      label: '19V_BACKLIGHT (eDP LED Boost Output)',
      railClass: 'POWER_BOOST',
      highlightColor: '#a855f7',
      routedCells: [
        { row: 8, col: 11, layer: 'TOP_COPPER' },
        { row: 8, col: 12, layer: 'TOP_COPPER' },
        { row: 9, col: 12, layer: 'TOP_COPPER' },
        { row: 10, col: 12, layer: 'TOP_COPPER' },
        { row: 11, col: 12, layer: 'TOP_COPPER' },
        { row: 12, col: 12, layer: 'TOP_COPPER' }
      ],
      connectedComponents: ['PL801', 'D801', 'U800', 'C8512', 'Q8501', 'F800', 'TP_19V_BKLT', 'J8500'],
      telemetryExpectation: {
        expectedVoltageDc: 19.5,
        voltageToleranceV: 0.8,
        expectedResistanceToGndOhms: 62000,
        shortThresholdOhms: 80,
        expectedDiodeDropV: 0.545,
        nominalCurrentA: 0.35,
        diagnosticNotes: {
          nominal: '19.50V boosted LED backlight supply feeding eDP display connector J8500.',
          shorted: 'Short circuit on 19V_BACKLIGHT output filter (check C8512 or J8500 pins).',
          open: '0V on backlight output — check F800 backlight fuse or U800 enable.',
          leaking: '19V_BACKLIGHT leaking into adjacent I2C_BKLT_SDA data line via compromised C8512/Q8501 pad!'
        },
        recommendedProbePoint: { row: 10, col: 13, designator: 'TP_19V_BKLT' }
      }
    },
    I2C_BKLT_SDA: {
      netId: 'I2C_BKLT_SDA',
      label: 'I2C_BKLT_SDA (3.3V Backlight Data Bus)',
      railClass: 'DATA_BUS',
      highlightColor: '#06b6d4',
      routedCells: [
        { row: 11, col: 8, layer: 'TOP_COPPER' },
        { row: 11, col: 9, layer: 'TOP_COPPER' },
        { row: 11, col: 10, layer: 'TOP_COPPER' },
        { row: 11, col: 11, layer: 'TOP_COPPER' },
        { row: 12, col: 11, layer: 'TOP_COPPER' }
      ],
      connectedComponents: ['U5000', 'R5012', 'U800', 'C8512', 'TP_I2C_SDA', 'J8500'],
      telemetryExpectation: {
        expectedVoltageDc: 3.28,
        voltageToleranceV: 0.25,
        expectedResistanceToGndOhms: 22400,
        shortThresholdOhms: 100,
        expectedDiodeDropV: 0.44,
        nominalCurrentA: 0.0015,
        diagnosticNotes: {
          nominal: '3.28V I2C serial data line pulled up to PP3V3_G3H via R5012 (2.2 kΩ).',
          shorted: 'I2C_BKLT_SDA pulled low to ground — U800 cannot receive brightness commands.',
          open: 'Open pull-up R5012 — floating I2C data line.',
          leaking: 'CRITICAL OVERVOLTAGE (> 5.0V): 19V_BACKLIGHT rail is leaking directly into I2C_BKLT_SDA!'
        },
        recommendedProbePoint: { row: 12, col: 10, designator: 'TP_I2C_SDA' }
      }
    }
  };

  // Helper to register component and place it on the 16x16 grid
  const components: Record<string, PCBComponentNode> = {};
  const addComp = (comp: PCBComponentNode) => {
    components[comp.id] = comp;
    gridLayout[comp.bbox.row][comp.bbox.col] = comp.id;
  };

  // 4 Chassis Ground Mounting Holes
  [
    { id: 'GND_M1', row: 1, col: 1 },
    { id: 'GND_M2', row: 1, col: 14 },
    { id: 'GND_M3', row: 14, col: 1 },
    { id: 'GND_M4', row: 14, col: 14 }
  ].forEach((m) =>
    addComp({
      id: m.id,
      tileTypeId: 'mnt_gnd_standoff',
      label: `${m.id} Plated Ground Ring`,
      partSpec: 'M2.5-ENIG-8VIA',
      packageType: 'MOUNT_HOLE_GND',
      category: 'connector',
      bbox: { row: m.row, col: m.col, widthMm: 3.5, lengthMm: 3.5, heightMm: 0.4, rotationDeg: 0 },
      pins: [{ pinId: '1', name: 'GND_CHASSIS', netId: 'GND', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.0 }],
      primaryNetId: 'GND',
      electrical: { internalResistanceToGndOhms: 0.05, seriesResistanceOhms: 0.01 },
      doc: 'Plated chassis ground standoff providing 0.00V reference for the black multimeter COM probe.'
    })
  );

  // J3300 USB-C Receptacle
  addComp({
    id: 'J3300',
    tileTypeId: 'conn_j3300_usbc',
    label: 'J3300 USB-C Power Port',
    partSpec: 'USB4-24P-RECEPTACLE',
    packageType: 'CONN_USBC_24',
    category: 'connector',
    bbox: { row: 3, col: 2, widthMm: 8.9, lengthMm: 7.3, heightMm: 3.2, rotationDeg: 0 },
    pins: [
      { pinId: 'A4/B9', name: 'VBUS_20V', netId: 'PP20V_USBC_XB', isoOffset: { dx: 12, dy: -6 }, nominalDiodeDropV: 0.512 },
      { pinId: 'A1/B12', name: 'GND_RET', netId: 'GND', isoOffset: { dx: -12, dy: 8 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PP20V_USBC_XB',
    electrical: { internalResistanceToGndOhms: 500000, seriesResistanceOhms: 0.02 },
    doc: 'Primary USB Type-C power and data input receptacle.'
  });

  // U3100 CD3217 USB-C PD Controller
  addComp({
    id: 'U3100',
    tileTypeId: 'ic_u3100_cd3217',
    label: 'U3100 CD3217B12 PD Controller',
    partSpec: 'CD3217B12-BGA96',
    packageType: 'BGA_96_SOC',
    category: 'ic',
    bbox: { row: 4, col: 4, widthMm: 4.5, lengthMm: 4.5, heightMm: 1.1, rotationDeg: 0 },
    pins: [
      { pinId: 'A1', name: 'VBUS_SENSE', netId: 'PP20V_USBC_XB', isoOffset: { dx: -10, dy: -8 }, nominalDiodeDropV: 0.512 },
      { pinId: 'C4', name: 'VIN_3V3', netId: 'PP3V3_G3H', isoOffset: { dx: 10, dy: 8 }, nominalDiodeDropV: 0.382 },
      { pinId: 'G8', name: 'VSS_GND', netId: 'GND', isoOffset: { dx: 0, dy: 12 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PP20V_USBC_XB',
    secondaryNetId: 'PP3V3_G3H',
    electrical: { internalResistanceToGndOhms: 68000, seriesResistanceOhms: 0.1, regulatedOutputV: 20.5 },
    doc: 'Negotiates USB Power Delivery 20.5V profile when powered by PP3V3_G3H standby rail.'
  });

  // TP_USBC_20V Test Point
  addComp({
    id: 'TP_USBC_20V',
    tileTypeId: 'tp_gold_probe_pad',
    label: 'TP_USBC_20V Test Point',
    partSpec: 'TP-ENIG-1.2MM',
    packageType: 'TP_GOLD',
    category: 'connector',
    bbox: { row: 2, col: 4, widthMm: 1.2, lengthMm: 1.2, heightMm: 0.15, rotationDeg: 0 },
    pins: [{ pinId: '1', name: 'PP20V_USBC_XB', netId: 'PP20V_USBC_XB', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.512 }],
    primaryNetId: 'PP20V_USBC_XB',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.005 },
    doc: 'Direct measurement pad for raw 20.50V USB-C VBUS input before protection MOSFET PQ701.'
  });

  // PQ701 Input Protection MOSFET
  addComp({
    id: 'PQ701',
    tileTypeId: 'pwr_pq701_mosfet',
    label: 'PQ701 Inrush Protection FET',
    partSpec: 'AON7408-DFN8',
    packageType: 'SOIC_8_MOSFET',
    category: 'power',
    bbox: { row: 3, col: 5, widthMm: 3.3, lengthMm: 3.3, heightMm: 0.9, rotationDeg: 0 },
    pins: [
      { pinId: '1-3', name: 'SOURCE_USBC', netId: 'PP20V_USBC_XB', isoOffset: { dx: -12, dy: -4 }, nominalDiodeDropV: 0.512 },
      { pinId: '5-8', name: 'DRAIN_DCIN', netId: 'PPDCIN_G3H', isoOffset: { dx: 12, dy: 4 }, nominalDiodeDropV: 0.468 }
    ],
    primaryNetId: 'PP20V_USBC_XB',
    secondaryNetId: 'PPDCIN_G3H',
    electrical: { internalResistanceToGndOhms: 250000, seriesResistanceOhms: 0.018 },
    doc: 'Reverse-current and inrush protection MOSFET coupling PP20V_USBC_XB into PPDCIN_G3H.'
  });

  // F700 Main Input Fuse
  addComp({
    id: 'F700',
    tileTypeId: 'prot_f700_fuse',
    label: 'F700 Main 3A Input Fuse',
    partSpec: '3.0A-32V-0603-FAST',
    packageType: '0603_FUSE',
    category: 'protection',
    bbox: { row: 3, col: 6, widthMm: 1.6, lengthMm: 0.8, heightMm: 0.65, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'FUSE_IN', netId: 'PP20V_USBC_XB', isoOffset: { dx: -10, dy: -5 }, nominalDiodeDropV: 0.51 },
      { pinId: '2', name: 'PPDCIN_G3H', netId: 'PPDCIN_G3H', isoOffset: { dx: 10, dy: 5 }, nominalDiodeDropV: 0.468 }
    ],
    primaryNetId: 'PPDCIN_G3H',
    secondaryNetId: 'PP20V_USBC_XB',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.04, currentRatingA: 3.0 },
    doc: 'Primary 3.0A 0603 ceramic fuse. If blown open, PP20V_USBC_XB reads 20.5V while PPDCIN_G3H drops to 0.00V.'
  });

  // TP_DCIN_FUSE Test Point
  addComp({
    id: 'TP_DCIN_FUSE',
    tileTypeId: 'tp_gold_probe_pad',
    label: 'TP_DCIN_FUSE Test Point',
    partSpec: 'TP-ENIG-1.2MM',
    packageType: 'TP_GOLD',
    category: 'connector',
    bbox: { row: 2, col: 7, widthMm: 1.2, lengthMm: 1.2, heightMm: 0.15, rotationDeg: 0 },
    pins: [{ pinId: '1', name: 'PPDCIN_G3H', netId: 'PPDCIN_G3H', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.468 }],
    primaryNetId: 'PPDCIN_G3H',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.005 },
    doc: 'Post-fuse diagnostic test point on PPDCIN_G3H (expected 20.42V DC / 39.2 kΩ to GND).'
  });

  // C3108 Input Decoupling MLCC
  addComp({
    id: 'C3108',
    tileTypeId: 'pas_c3108_mlcc',
    label: 'C3108 25V Input Filter Cap',
    partSpec: '4.7uF-25V-X7R-0805',
    packageType: '0805_CAP',
    category: 'passive',
    bbox: { row: 4, col: 7, widthMm: 2.0, lengthMm: 1.25, heightMm: 0.85, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'PPDCIN_G3H', netId: 'PPDCIN_G3H', isoOffset: { dx: -8, dy: -4 }, nominalDiodeDropV: 0.468 },
      { pinId: '2', name: 'GND', netId: 'GND', isoOffset: { dx: 8, dy: 4 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PPDCIN_G3H',
    secondaryNetId: 'GND',
    electrical: { internalResistanceToGndOhms: 180000, seriesResistanceOhms: 0.05, capacitanceUf: 4.7 },
    doc: 'High-voltage 0805 ceramic decoupling capacitor filtering spikes on PPDCIN_G3H.'
  });

  // U701 ISL9240 Buck-Boost Charger IC
  addComp({
    id: 'U701',
    tileTypeId: 'ic_u701_isl9240',
    label: 'U701 ISL9240 Charger PMIC',
    partSpec: 'ISL9240HI-QFN32',
    packageType: 'QFN_32_IC',
    category: 'ic',
    bbox: { row: 5, col: 8, widthMm: 4.0, lengthMm: 4.0, heightMm: 0.95, rotationDeg: 0 },
    pins: [
      { pinId: '22', name: 'ADP_IN', netId: 'PPDCIN_G3H', isoOffset: { dx: -10, dy: -8 }, nominalDiodeDropV: 0.468 },
      { pinId: '14', name: 'VSYS_OUT', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: 10, dy: 8 }, nominalDiodeDropV: 0.425 },
      { pinId: '33', name: 'EPAD_GND', netId: 'GND', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PPVBAT_G3H_CHGR',
    secondaryNetId: 'PPDCIN_G3H',
    electrical: { internalResistanceToGndOhms: 45000, seriesResistanceOhms: 0.08, regulatedOutputV: 12.6 },
    doc: 'Main buck-boost battery charger and system power rail controller generating 12.60V PPVBAT_G3H_CHGR.'
  });

  // PL702 2.2uH Buck-Boost Inductor
  addComp({
    id: 'PL702',
    tileTypeId: 'pwr_pl702_inductor',
    label: 'PL702 2.2uH System Buck Coil',
    partSpec: '2.2uH-12A-7070',
    packageType: 'IND_7070_SHIELDED',
    category: 'power',
    bbox: { row: 6, col: 8, widthMm: 7.0, lengthMm: 7.0, heightMm: 3.0, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'LX1_SW', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: -12, dy: -6 }, nominalDiodeDropV: 0.425 },
      { pinId: '2', name: 'PPVBAT_OUT', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: 12, dy: 6 }, nominalDiodeDropV: 0.425 }
    ],
    primaryNetId: 'PPVBAT_G3H_CHGR',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.015, inductanceUh: 2.2 },
    doc: 'Shielded molded alloy power inductor for the PPVBAT_G3H_CHGR 12.60V switching phase.'
  });

  // R702 Current Sense Shunt Resistor
  addComp({
    id: 'R702',
    tileTypeId: 'pas_r702_shunt',
    label: 'R702 10mΩ Current Shunt',
    partSpec: '0.010R-1W-1%',
    packageType: '0402_RES',
    category: 'passive',
    bbox: { row: 7, col: 8, widthMm: 1.6, lengthMm: 0.8, heightMm: 0.5, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'CSIP', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: -8, dy: -4 }, nominalDiodeDropV: 0.425 },
      { pinId: '2', name: 'CSIN', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: 8, dy: 4 }, nominalDiodeDropV: 0.425 }
    ],
    primaryNetId: 'PPVBAT_G3H_CHGR',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.01 },
    doc: 'Precision 10 mΩ current-sense resistor monitoring PPVBAT_G3H_CHGR load current.'
  });

  // TP_PPVBAT Test Point
  addComp({
    id: 'TP_PPVBAT',
    tileTypeId: 'tp_gold_probe_pad',
    label: 'TP_PPVBAT 12.6V Test Pad',
    partSpec: 'TP-ENIG-1.2MM',
    packageType: 'TP_GOLD',
    category: 'connector',
    bbox: { row: 7, col: 9, widthMm: 1.2, lengthMm: 1.2, heightMm: 0.15, rotationDeg: 0 },
    pins: [{ pinId: '1', name: 'PPVBAT_G3H_CHGR', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.425 }],
    primaryNetId: 'PPVBAT_G3H_CHGR',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.005 },
    doc: 'Golden test target for measuring PPVBAT_G3H_CHGR (12.60V nominal).'
  });

  // U7800 3.3V G3H Standby Regulator
  addComp({
    id: 'U7800',
    tileTypeId: 'ic_u7800_pmic_g3h',
    label: 'U7800 3.3V G3H Regulator',
    partSpec: 'TPS51980-QFN32',
    packageType: 'QFN_32_IC',
    category: 'ic',
    bbox: { row: 8, col: 5, widthMm: 4.0, lengthMm: 4.0, heightMm: 0.9, rotationDeg: 0 },
    pins: [
      { pinId: '6', name: 'VIN_12V6', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: 10, dy: -8 }, nominalDiodeDropV: 0.425 },
      { pinId: '18', name: 'VOUT_3V3_G3H', netId: 'PP3V3_G3H', isoOffset: { dx: -10, dy: 8 }, nominalDiodeDropV: 0.382 },
      { pinId: '33', name: 'GND_PAD', netId: 'GND', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PP3V3_G3H',
    secondaryNetId: 'PPVBAT_G3H_CHGR',
    electrical: { internalResistanceToGndOhms: 28000, seriesResistanceOhms: 0.12, regulatedOutputV: 3.3 },
    doc: 'Steps down 12.60V PPVBAT_G3H_CHGR to create the 3.30V Always-On PP3V3_G3H rail.'
  });

  // C704 Decoupling MLCC on PP3V3_G3H
  addComp({
    id: 'C704',
    tileTypeId: 'pas_c704_mlcc',
    label: 'C704 10uF 3.3V Standby Cap',
    partSpec: '10uF-6.3V-X5R-0402',
    packageType: '0402_CAP',
    category: 'passive',
    bbox: { row: 10, col: 5, widthMm: 1.0, lengthMm: 0.5, heightMm: 0.55, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'PP3V3_G3H', netId: 'PP3V3_G3H', isoOffset: { dx: -7, dy: -4 }, nominalDiodeDropV: 0.382 },
      { pinId: '2', name: 'GND', netId: 'GND', isoOffset: { dx: 7, dy: 4 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PP3V3_G3H',
    secondaryNetId: 'GND',
    electrical: { internalResistanceToGndOhms: 95000, seriesResistanceOhms: 0.05, capacitanceUf: 10.0 },
    doc: '0402 MLCC bypass capacitor on PP3V3_G3H. Classic failure point for 0.6 Ω dead short to ground.'
  });

  // TP_3V3_G3H Test Point
  addComp({
    id: 'TP_3V3_G3H',
    tileTypeId: 'tp_gold_probe_pad',
    label: 'TP_3V3_G3H Standby Test Pad',
    partSpec: 'TP-ENIG-1.2MM',
    packageType: 'TP_GOLD',
    category: 'connector',
    bbox: { row: 10, col: 4, widthMm: 1.2, lengthMm: 1.2, heightMm: 0.15, rotationDeg: 0 },
    pins: [{ pinId: '1', name: 'PP3V3_G3H', netId: 'PP3V3_G3H', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.382 }],
    primaryNetId: 'PP3V3_G3H',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.005 },
    doc: 'Primary diagnostic probe pad for PP3V3_G3H (expected 3.30V continuous standby, 14.2 kΩ to GND).'
  });

  // U5000 Embedded Controller
  addComp({
    id: 'U5000',
    tileTypeId: 'ic_u5000_ec_it8987',
    label: 'U5000 IT8987E System EC',
    partSpec: 'IT8987E-LQFP128',
    packageType: 'QFN_32_IC',
    category: 'ic',
    bbox: { row: 11, col: 7, widthMm: 5.5, lengthMm: 5.5, heightMm: 1.2, rotationDeg: 0 },
    pins: [
      { pinId: '11', name: 'VSTBY_3V3', netId: 'PP3V3_G3H', isoOffset: { dx: -10, dy: -6 }, nominalDiodeDropV: 0.382 },
      { pinId: '84', name: 'I2C_BKLT_SDA', netId: 'I2C_BKLT_SDA', isoOffset: { dx: 10, dy: 6 }, nominalDiodeDropV: 0.44 },
      { pinId: '64', name: 'VSS_GND', netId: 'GND', isoOffset: { dx: 0, dy: 10 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: 'PP3V3_G3H',
    secondaryNetId: 'I2C_BKLT_SDA',
    electrical: { internalResistanceToGndOhms: 42000, seriesResistanceOhms: 0.15 },
    doc: 'Embedded Controller powered by PP3V3_G3H; drives I2C_BKLT_SDA brightness commands to U800.'
  });

  // R5012 I2C Pull-Up Resistor
  addComp({
    id: 'R5012',
    tileTypeId: 'pas_r5012_pullup',
    label: 'R5012 2.2kΩ I2C SDA Pull-Up',
    partSpec: '2.2kOhm-5%-0402',
    packageType: '0402_RES',
    category: 'passive',
    bbox: { row: 11, col: 8, widthMm: 1.0, lengthMm: 0.5, heightMm: 0.45, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'PP3V3_G3H', netId: 'PP3V3_G3H', isoOffset: { dx: -8, dy: -4 }, nominalDiodeDropV: 0.382 },
      { pinId: '2', name: 'I2C_BKLT_SDA', netId: 'I2C_BKLT_SDA', isoOffset: { dx: 8, dy: 4 }, nominalDiodeDropV: 0.44 }
    ],
    primaryNetId: 'I2C_BKLT_SDA',
    secondaryNetId: 'PP3V3_G3H',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 2200 },
    doc: 'Pulls I2C_BKLT_SDA up to 3.30V PP3V3_G3H.'
  });

  // PL801 Backlight Boost Coil
  addComp({
    id: 'PL801',
    tileTypeId: 'pwr_pl801_boost_coil',
    label: 'PL801 10uH Backlight Boost Coil',
    partSpec: '10uH-4.5A-SHIELDED',
    packageType: 'IND_7070_SHIELDED',
    category: 'power',
    bbox: { row: 8, col: 10, widthMm: 6.5, lengthMm: 6.5, heightMm: 2.8, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: 'PPVBAT_IN', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: -12, dy: -6 }, nominalDiodeDropV: 0.425 },
      { pinId: '2', name: 'BKLT_SW', netId: '19V_BACKLIGHT', isoOffset: { dx: 12, dy: 6 }, nominalDiodeDropV: 0.545 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    secondaryNetId: 'PPVBAT_G3H_CHGR',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.045, inductanceUh: 10.0 },
    doc: 'Energy-storage boost inductor stepping 12.6V PPVBAT_G3H_CHGR up to 19.5V for the display backlight.'
  });

  // D801 Backlight Boost Schottky Diode
  addComp({
    id: 'D801',
    tileTypeId: 'pwr_d801_schottky',
    label: 'D801 Backlight Boost Rectifier',
    partSpec: 'PMEG4020ER-SOD323',
    packageType: 'SOD_323_DIODE',
    category: 'power',
    bbox: { row: 8, col: 11, widthMm: 2.5, lengthMm: 1.3, heightMm: 0.9, rotationDeg: 0 },
    pins: [
      { pinId: 'A', name: 'ANODE_SW', netId: 'PPVBAT_G3H_CHGR', isoOffset: { dx: -9, dy: -4 }, nominalDiodeDropV: 0.425 },
      { pinId: 'K', name: 'CATHODE_19V', netId: '19V_BACKLIGHT', isoOffset: { dx: 9, dy: 4 }, nominalDiodeDropV: 0.545 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    secondaryNetId: 'PPVBAT_G3H_CHGR',
    electrical: { internalResistanceToGndOhms: 450000, seriesResistanceOhms: 0.15 },
    doc: 'Schottky boost diode rectifying high-voltage pulses onto the 19V_BACKLIGHT rail.'
  });

  // U800 LP8550 Backlight Boost Driver IC
  addComp({
    id: 'U800',
    tileTypeId: 'ic_u800_lp8550',
    label: 'U800 LP8550 Backlight Driver',
    partSpec: 'LP8550TLX-BGA25',
    packageType: 'BGA_96_SOC',
    category: 'ic',
    bbox: { row: 9, col: 11, widthMm: 3.5, lengthMm: 3.5, heightMm: 0.9, rotationDeg: 0 },
    pins: [
      { pinId: 'D1', name: 'VOUT_OVP', netId: '19V_BACKLIGHT', isoOffset: { dx: 10, dy: -6 }, nominalDiodeDropV: 0.545 },
      { pinId: 'A4', name: 'I2C_SDA', netId: 'I2C_BKLT_SDA', isoOffset: { dx: -10, dy: 6 }, nominalDiodeDropV: 0.44 },
      { pinId: 'E5', name: 'GND', netId: 'GND', isoOffset: { dx: 0, dy: 10 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    secondaryNetId: 'I2C_BKLT_SDA',
    electrical: { internalResistanceToGndOhms: 92000, seriesResistanceOhms: 0.1, regulatedOutputV: 19.5 },
    doc: 'Controls PL801 boost switching to maintain 19.50V on 19V_BACKLIGHT; reads brightness over I2C_BKLT_SDA.'
  });

  // C8512 Backlight Output Filter Capacitor (adjacent to I2C_BKLT_SDA)
  addComp({
    id: 'C8512',
    tileTypeId: 'pas_c8512_bklt_cap',
    label: 'C8512 50V Backlight Filter Cap',
    partSpec: '2.2uF-50V-X7R-0805',
    packageType: '0805_CAP',
    category: 'passive',
    bbox: { row: 10, col: 11, widthMm: 2.0, lengthMm: 1.25, heightMm: 0.9, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: '19V_BACKLIGHT', netId: '19V_BACKLIGHT', isoOffset: { dx: 8, dy: -4 }, nominalDiodeDropV: 0.545 },
      { pinId: '2', name: 'GND', netId: 'GND', isoOffset: { dx: -8, dy: 4 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    secondaryNetId: 'I2C_BKLT_SDA',
    electrical: { internalResistanceToGndOhms: 240000, seriesResistanceOhms: 0.05, capacitanceUf: 2.2 },
    doc: 'High-voltage 50V MLCC filtering 19V_BACKLIGHT. Positioned 0.2mm from I2C_BKLT_SDA trace — liquid corrosion here bridges 19V into the 3.3V data bus!'
  });

  // Q8501 Backlight Enable Switch
  addComp({
    id: 'Q8501',
    tileTypeId: 'pwr_q8501_bklt_sw',
    label: 'Q8501 Backlight Gate Transistor',
    partSpec: 'DMN601DWK-SOT23',
    packageType: 'SOT_23_3',
    category: 'power',
    bbox: { row: 10, col: 12, widthMm: 2.9, lengthMm: 1.6, heightMm: 0.85, rotationDeg: 0 },
    pins: [
      { pinId: '3', name: 'DRAIN_19V', netId: '19V_BACKLIGHT', isoOffset: { dx: 0, dy: -8 }, nominalDiodeDropV: 0.545 },
      { pinId: '1', name: 'GATE_CTRL', netId: 'I2C_BKLT_SDA', isoOffset: { dx: -8, dy: 6 }, nominalDiodeDropV: 0.44 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    secondaryNetId: 'I2C_BKLT_SDA',
    electrical: { internalResistanceToGndOhms: 310000, seriesResistanceOhms: 0.08 },
    doc: 'SOT-23 dual switching transistor gating the 19V_BACKLIGHT output path.'
  });

  // F800 Backlight Fuse
  addComp({
    id: 'F800',
    tileTypeId: 'prot_f800_bklt_fuse',
    label: 'F800 2A Backlight Output Fuse',
    partSpec: '2.0A-24V-0603',
    packageType: '0603_FUSE',
    category: 'protection',
    bbox: { row: 11, col: 12, widthMm: 1.6, lengthMm: 0.8, heightMm: 0.65, rotationDeg: 0 },
    pins: [
      { pinId: '1', name: '19V_BKLT_IN', netId: '19V_BACKLIGHT', isoOffset: { dx: -8, dy: -4 }, nominalDiodeDropV: 0.545 },
      { pinId: '2', name: '19V_BKLT_CONN', netId: '19V_BACKLIGHT', isoOffset: { dx: 8, dy: 4 }, nominalDiodeDropV: 0.545 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.05, currentRatingA: 2.0 },
    doc: 'Protects the eDP cable and LCD backlight array against short circuits.'
  });

  // TP_19V_BKLT Test Point
  addComp({
    id: 'TP_19V_BKLT',
    tileTypeId: 'tp_gold_probe_pad',
    label: 'TP_19V_BKLT Output Test Pad',
    partSpec: 'TP-ENIG-1.2MM',
    packageType: 'TP_GOLD',
    category: 'connector',
    bbox: { row: 10, col: 13, widthMm: 1.2, lengthMm: 1.2, heightMm: 0.15, rotationDeg: 0 },
    pins: [{ pinId: '1', name: '19V_BACKLIGHT', netId: '19V_BACKLIGHT', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.545 }],
    primaryNetId: '19V_BACKLIGHT',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.005 },
    doc: 'Diagnostic test pad on 19V_BACKLIGHT (expected 19.50V DC when display is connected).'
  });

  // TP_I2C_SDA Test Point
  addComp({
    id: 'TP_I2C_SDA',
    tileTypeId: 'tp_gold_probe_pad',
    label: 'TP_I2C_SDA Data Bus Test Pad',
    partSpec: 'TP-ENIG-1.2MM',
    packageType: 'TP_GOLD',
    category: 'connector',
    bbox: { row: 12, col: 10, widthMm: 1.2, lengthMm: 1.2, heightMm: 0.15, rotationDeg: 0 },
    pins: [{ pinId: '1', name: 'I2C_BKLT_SDA', netId: 'I2C_BKLT_SDA', isoOffset: { dx: 0, dy: 0 }, nominalDiodeDropV: 0.44 }],
    primaryNetId: 'I2C_BKLT_SDA',
    electrical: { internalResistanceToGndOhms: 999999, seriesResistanceOhms: 0.005 },
    doc: 'Diagnostic test pad for I2C_BKLT_SDA (expected 3.28V DC; >5V indicates high-voltage rail leakage!).'
  });

  // J8500 30-Pin eDP Display Connector
  addComp({
    id: 'J8500',
    tileTypeId: 'conn_j8500_edp',
    label: 'J8500 30-Pin eDP LCD Connector',
    partSpec: 'IPEX-20525-030E',
    packageType: 'CONN_EDP_30',
    category: 'connector',
    bbox: { row: 12, col: 12, widthMm: 14.0, lengthMm: 4.2, heightMm: 1.8, rotationDeg: 0 },
    pins: [
      { pinId: '1-2', name: 'PPVOUT_S0_LCDBKLT', netId: '19V_BACKLIGHT', isoOffset: { dx: 12, dy: -6 }, nominalDiodeDropV: 0.545 },
      { pinId: '14', name: 'I2C_BKLT_SDA', netId: 'I2C_BKLT_SDA', isoOffset: { dx: -10, dy: 4 }, nominalDiodeDropV: 0.44 },
      { pinId: '30', name: 'GND_SHIELD', netId: 'GND', isoOffset: { dx: 0, dy: 10 }, nominalDiodeDropV: 0.0 }
    ],
    primaryNetId: '19V_BACKLIGHT',
    secondaryNetId: 'I2C_BKLT_SDA',
    electrical: { internalResistanceToGndOhms: 320000, seriesResistanceOhms: 0.03 },
    doc: '30-pin eDP display receptacle receiving 19V_BACKLIGHT and I2C_BKLT_SDA.'
  });

  // Populate visible copper trace tiles along netlist paths where no active component sits
  const placeTraceIfEmpty = (r: number, c: number, tileId: string) => {
    if (gridLayout[r][c] === 'sub_fr4_emerald') {
      gridLayout[r][c] = tileId;
    }
  };

  // PP20V_USBC_XB traces
  placeTraceIfEmpty(3, 3, 'tr_copper_h');
  placeTraceIfEmpty(3, 4, 'tr_copper_tee');

  // PPDCIN_G3H traces
  placeTraceIfEmpty(3, 7, 'tr_copper_tee');
  placeTraceIfEmpty(3, 8, 'tr_copper_v');
  placeTraceIfEmpty(4, 8, 'tr_copper_v');

  // PPVBAT_G3H_CHGR traces
  placeTraceIfEmpty(8, 8, 'tr_copper_tee');
  placeTraceIfEmpty(8, 9, 'tr_copper_h');
  placeTraceIfEmpty(8, 7, 'tr_copper_h');
  placeTraceIfEmpty(8, 6, 'tr_via_stitched');

  // PP3V3_G3H traces
  placeTraceIfEmpty(9, 5, 'tr_copper_v');
  placeTraceIfEmpty(11, 5, 'tr_copper_tee');
  placeTraceIfEmpty(11, 6, 'tr_copper_h');

  // I2C_BKLT_SDA traces
  placeTraceIfEmpty(11, 9, 'tr_copper_h');
  placeTraceIfEmpty(11, 10, 'tr_copper_tee');
  placeTraceIfEmpty(11, 11, 'tr_via_stitched');

  // 19V_BACKLIGHT traces
  placeTraceIfEmpty(8, 12, 'tr_copper_v');
  placeTraceIfEmpty(9, 12, 'tr_copper_v');

  return {
    schemaVersion: '2.1.0-DIMETRIC-CAD',
    boardId: '820-01987-A',
    boardTitle: '820-01987-A Logic Board — Power & eDP Backlight Twin',
    boardRevision: 'Rev 2.4 Production',
    dimensions: {
      rows: ROWS,
      cols: COLS,
      pitchMm: 2.5,
      layerCount: 8
    },
    netlists,
    components,
    gridLayout
  };
}
