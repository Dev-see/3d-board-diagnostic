/**
 * @file isoPixelRenderer.ts
 * @description 2:1 Dimetric Isometric 3D Pixel-Art & Volumetric PCB Rendering Engine.
 * Preserves the exact 2:1 dimetric projection (HALF_W = 64, QUARTER_W = 32, 128x128 crisp pixel tiles,
 * Painter's algorithm depth sorting) of the remixed studio while rendering 3D extruded SMD/QFN/BGA
 * electronics packages, copper netlist traces, thermal IR overlays, and 3D multimeter probes.
 */

import {
  PCBBoardSchema,
  PCBComponentNode,
  PCB_PALETTE_TILES,
  PaletteTileDefinition
} from './pcbSchema';
import { BoardElectricalSolution } from './diagnosticsEngine';

export const ISO_ROWS = 16;
export const ISO_COLS = 16;
export const HALF_W = 64;
export const QUARTER_W = 32;
export const PAD = 64;
export const ORIGIN_X = PAD + (ISO_ROWS - 1) * HALF_W; // 1024
export const ORIGIN_Y = PAD; // 64
export const WORLD_CENTER_X = ORIGIN_X + HALF_W; // 1088
export const WORLD_CENTER_Y = ORIGIN_Y + ((ISO_ROWS + ISO_COLS) * QUARTER_W) / 2; // 576

/**
 * Helper to draw a 2:1 dimetric isometric 3D prism (box) onto a 2D canvas context.
 * Center of the base diamond is at (cx, cy).
 * rx = half-width in isometric X, ry = half-depth in isometric Y, h = vertical extrusion height in px.
 */
export function drawIsoBox3D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  h: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
  strokeColor?: string
) {
  const topY = cy - ry;
  const botY = cy + ry;
  const leftX = cx - rx;
  const rightX = cx + rx;

  // Left (SW) vertical face
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(leftX, cy - h);
  ctx.lineTo(cx, botY - h);
  ctx.lineTo(cx, botY);
  ctx.lineTo(leftX, cy);
  ctx.closePath();
  ctx.fill();

  // Right (SE) vertical face
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(cx, botY - h);
  ctx.lineTo(rightX, cy - h);
  ctx.lineTo(rightX, cy);
  ctx.lineTo(cx, botY);
  ctx.closePath();
  ctx.fill();

  // Top diamond face
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(cx, topY - h);
  ctx.lineTo(rightX, cy - h);
  ctx.lineTo(cx, botY - h);
  ctx.lineTo(leftX, cy - h);
  ctx.closePath();
  ctx.fill();

  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, topY - h);
    ctx.lineTo(rightX, cy - h);
    ctx.lineTo(cx, botY - h);
    ctx.lineTo(leftX, cy - h);
    ctx.closePath();
    ctx.stroke();
  }
}

/**
 * Draws the standard 128x128 2:1 dimetric PCB FR-4 substrate diamond tile
 * with 3D laminated fiberglass/copper edge thickness.
 */
function drawBasePCBDiamond(
  ctx: CanvasRenderingContext2D,
  variant: 'EMERALD' | 'GND_POUR' = 'EMERALD'
) {
  const cx = 64;
  const cy = 96;
  const rx = 64;
  const ry = 32;
  const slabH = 5;

  const topCol = variant === 'GND_POUR' ? '#0c3b2e' : '#0a2e23';
  const leftCol = '#072018';
  const rightCol = '#051711';

  drawIsoBox3D(ctx, cx, cy + slabH, rx, ry, slabH, topCol, leftCol, rightCol, 'rgba(52, 211, 153, 0.16)');

  // Subtle pixel grid / crosshatch for copper ground pour
  if (variant === 'GND_POUR') {
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)';
    ctx.lineWidth = 1;
    for (let offset = -24; offset <= 24; offset += 12) {
      ctx.beginPath();
      ctx.moveTo(cx + offset - 18, cy + offset * 0.5);
      ctx.lineTo(cx + offset + 18, cy + offset * 0.5);
      ctx.stroke();
    }
    // Via stitching dots
    const vias = [
      [64, 76],
      [92, 96],
      [64, 114],
      [36, 96]
    ];
    vias.forEach(([vx, vy]) => {
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.ellipse(vx, vy, 3.2, 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#091914';
      ctx.beginPath();
      ctx.ellipse(vx, vy, 1.3, 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/**
 * Procedurally synthesizes crisp 128x128 2:1 dimetric isometric pixel-art sprites
 * for every PCB component and substrate archetype in PCB_PALETTE_TILES.
 */
export function generateAllPCBTileSprites(): {
  staticUris: Record<string, string>;
  imageElements: Record<string, HTMLImageElement>;
} {
  const staticUris: Record<string, string> = {};
  const imageElements: Record<string, HTMLImageElement> = {};

  PCB_PALETTE_TILES.forEach((tile: PaletteTileDefinition) => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    const pkg = tile.packageType;

    // 1. Base PCB substrate diamond
    drawBasePCBDiamond(ctx, pkg === 'SUBSTRATE_GND_PLANE' ? 'GND_POUR' : 'EMERALD');

    // 2. Render specific 3D isometric package on top of the diamond center (cx = 64, cy = 96)
    const cx = 64;
    const cy = 96;

    if (pkg === 'TRACE_H' || pkg === 'TRACE_V' || pkg === 'TRACE_TEE' || pkg === 'VIA_PLATED') {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      if (pkg === 'TRACE_H' || pkg === 'TRACE_TEE') {
        ctx.beginPath();
        ctx.moveTo(32, 80);
        ctx.lineTo(96, 112);
        ctx.stroke();
      }
      if (pkg === 'TRACE_V' || pkg === 'TRACE_TEE') {
        ctx.beginPath();
        ctx.moveTo(96, 80);
        ctx.lineTo(32, 112);
        ctx.stroke();
      }
      // Highlight trace core
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2;
      if (pkg === 'TRACE_H' || pkg === 'TRACE_TEE') {
        ctx.beginPath();
        ctx.moveTo(32, 80);
        ctx.lineTo(96, 112);
        ctx.stroke();
      }
      if (pkg === 'TRACE_V' || pkg === 'TRACE_TEE') {
        ctx.beginPath();
        ctx.moveTo(96, 80);
        ctx.lineTo(32, 112);
        ctx.stroke();
      }
      if (pkg === 'VIA_PLATED' || pkg === 'TRACE_TEE') {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 8, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#051711';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 3.5, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pkg === 'TP_GOLD') {
      // Exposed ENIG Gold Test Point Pad
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 20, 10, 0, 0, Math.PI * 2);
      ctx.stroke();

      drawIsoBox3D(ctx, cx, cy, 15, 7.5, 2, '#fbbf24', '#d97706', '#b45309', '#fde68a');
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(cx, cy - 2, 5, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (pkg === 'MOUNT_HOLE_GND') {
      // Plated Chassis Ground Standoff Ring with 8 Perimeter Vias
      ctx.fillStyle = '#d4d4d8';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 24, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 12, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4;
        const vx = cx + Math.cos(ang) * 18;
        const vy = cy + Math.sin(ang) * 9;
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.arc(vx, vy, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (pkg === '0402_CAP' || pkg === '0805_CAP') {
      // 3D Isometric MLCC Ceramic Capacitor with Tin End-Caps & Gold Pads
      const isLarge = pkg === '0805_CAP';
      const rx = isLarge ? 24 : 18;
      const ry = isLarge ? 12 : 9;
      const h = isLarge ? 11 : 8;

      // White silkscreen outline
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - rx - 4, cy - ry - h - 2, (rx + 4) * 2, ry * 2 + h + 4);

      // Left Solder Pad + End Termination
      drawIsoBox3D(ctx, cx - rx * 0.45, cy - ry * 0.2, rx * 0.35, ry * 0.55, h, '#e4e4e7', '#a1a1aa', '#71717a');
      // Ceramic Dielectric Center Body
      drawIsoBox3D(
        ctx,
        cx,
        cy,
        rx * 0.48,
        ry * 0.55,
        h,
        isLarge ? '#b45309' : '#d97706',
        isLarge ? '#92400e' : '#b45309',
        '#78350f'
      );
      // Right Solder Pad + End Termination
      drawIsoBox3D(ctx, cx + rx * 0.45, cy + ry * 0.2, rx * 0.35, ry * 0.55, h, '#e4e4e7', '#a1a1aa', '#71717a');
    } else if (pkg === '0402_RES' || pkg === '0603_FUSE' || pkg === 'SOD_323_DIODE') {
      // 3D Isometric SMD Resistor, Ceramic Fuse, or Schottky Diode
      const isFuse = pkg === '0603_FUSE';
      const isDiode = pkg === 'SOD_323_DIODE';
      const h = isDiode ? 10 : 7;

      // Left terminal
      drawIsoBox3D(ctx, cx - 10, cy - 4, 8, 5, h, '#e4e4e7', '#a1a1aa', '#71717a');
      // Center body
      const topC = isFuse ? '#f8fafc' : isDiode ? '#27272a' : '#18181b';
      const leftC = isFuse ? '#cbd5e1' : '#18181b';
      const rightC = isFuse ? '#94a3b8' : '#09090b';
      drawIsoBox3D(ctx, cx, cy, 11, 6, h, topC, leftC, rightC, isFuse ? '#38bdf8' : '#52525b');
      // Right terminal
      drawIsoBox3D(ctx, cx + 10, cy + 4, 8, 5, h, '#e4e4e7', '#a1a1aa', '#71717a');

      // Top marking
      ctx.fillStyle = isFuse ? '#0f172a' : '#f8fafc';
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(isFuse ? '3A' : isDiode ? 'K|' : 'R01', cx, cy - h + 2);
    } else if (pkg === 'SOT_23_3' || pkg === 'SOIC_8_MOSFET') {
      // 3D Power MOSFET / SOT-23 Transistor with Gull-Wing Leads
      const isSoic = pkg === 'SOIC_8_MOSFET';
      const rx = isSoic ? 26 : 20;
      const ry = isSoic ? 13 : 10;
      const h = isSoic ? 11 : 9;

      // Metal drain tab / pins
      for (let p = -1; p <= 1; p++) {
        drawIsoBox3D(ctx, cx - 12 + p * 7, cy + 5 + p * 3, 4, 2.5, 4, '#e4e4e7', '#a1a1aa', '#71717a');
        drawIsoBox3D(ctx, cx + 12 + p * 7, cy - 5 + p * 3, 4, 2.5, 4, '#e4e4e7', '#a1a1aa', '#71717a');
      }

      // Molded IC package
      drawIsoBox3D(ctx, cx, cy, rx, ry, h, '#27272a', '#18181b', '#09090b', '#52525b');

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 7px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tile.code, cx, cy - h + 2);
    } else if (pkg === 'IND_7070_SHIELDED') {
      // Tall 3D Shielded Molded Power Inductor (PL702 / PL801)
      const rx = 34;
      const ry = 17;
      const h = 24;

      // Tinned Copper Base Pads
      drawIsoBox3D(ctx, cx - 14, cy - 7, 16, 8, 4, '#e2e8f0', '#94a3b8', '#64748b');
      drawIsoBox3D(ctx, cx + 14, cy + 7, 16, 8, 4, '#e2e8f0', '#94a3b8', '#64748b');

      // Main Shielded Ferrite Core Cube
      drawIsoBox3D(ctx, cx, cy, rx, ry, h, '#3f3f46', '#27272a', '#18181b', '#71717a');
      // Inner raised magnetic core cap
      drawIsoBox3D(ctx, cx, cy - h, rx - 6, ry - 3, 3, '#52525b', '#3f3f46', '#27272a');

      ctx.fillStyle = '#f4f4f5';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tile.code === 'PL801' ? '100' : '2R2', cx, cy - h);
    } else if (pkg === 'QFN_32_IC' || pkg === 'BGA_96_SOC') {
      // 3D QFN-32 / BGA-96 Silicon Controller Package
      const isBga = pkg === 'BGA_96_SOC';
      const rx = isBga ? 36 : 32;
      const ry = isBga ? 18 : 16;
      const h = isBga ? 13 : 10;

      // Perimeter QFN Landing Pads / BGA Solder Balls
      for (let i = -2; i <= 2; i++) {
        const px = cx + i * 8;
        const py = cy + i * 4;
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(px - 16, py + 6, 3, 3);
        ctx.fillRect(px + 13, py - 8, 3, 3);
      }

      // Main Silicon Epoxy Package
      drawIsoBox3D(
        ctx,
        cx,
        cy,
        rx,
        ry,
        h,
        isBga ? '#1e293b' : '#18181b',
        isBga ? '#0f172a' : '#09090b',
        '#020617',
        isBga ? '#38bdf8' : '#52525b'
      );

      // Metallic Die Cap / Laser Marking
      drawIsoBox3D(ctx, cx, cy - h, rx * 0.65, ry * 0.65, 1.5, '#334155', '#1e293b', '#0f172a');

      // Pin 1 Orientation Dot
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(cx - rx * 0.45, cy - h, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tile.code, cx, cy - h + 2);
    } else if (pkg === 'CONN_USBC_24' || pkg === 'CONN_EDP_30') {
      // 3D Metallic Receptacle Connectors (J3300 USB-C / J8500 eDP)
      const isUsbc = pkg === 'CONN_USBC_24';
      const rx = 40;
      const ry = 20;
      const h = isUsbc ? 20 : 14;

      // Gold fine-pitch pins along rear edge
      for (let k = -4; k <= 4; k++) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(cx + k * 6 - 1, cy + 8 + k * 2, 3, 4);
      }

      drawIsoBox3D(
        ctx,
        cx,
        cy,
        rx,
        ry,
        h,
        isUsbc ? '#cbd5e1' : '#334155',
        isUsbc ? '#94a3b8' : '#1e293b',
        isUsbc ? '#64748b' : '#0f172a',
        '#e2e8f0'
      );

      // Gold inner tongue for eDP or USB-C shell label
      ctx.fillStyle = isUsbc ? '#0f172a' : '#fbbf24';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(tile.code, cx, cy - h + 3);
    }

    const dataUri = c.toDataURL('image/png');
    staticUris[tile.id] = dataUri;
    const img = new Image();
    img.src = dataUri;
    imageElements[tile.id] = img;
  });

  return { staticUris, imageElements };
}

/**
 * Converts a 16x16 grid cell (row, col) to 2:1 dimetric world coordinates
 * (top-left of the 128x128 sprite tile and center of the diamond surface).
 */
export function cellToIsoWorld(row: number, col: number) {
  const ox = ORIGIN_X + (col - row) * HALF_W;
  const oy = ORIGIN_Y + (row + col) * QUARTER_W;
  return {
    ox,
    oy,
    cx: ox + 64,
    cy: oy + 96
  };
}

/**
 * Renders the complete 2:1 dimetric 3D PCB Digital Twin scene onto the target 2D canvas
 * (used for both real-time interactive viewport rendering and 1:1 PNG snapshot export).
 */
export function renderIsometricPCBScene(params: {
  ctx: CanvasRenderingContext2D;
  schema: PCBBoardSchema;
  solution: BoardElectricalSolution;
  spriteCache: Record<string, HTMLImageElement>;
  selectedComponentId: string | null;
  highlightedNetId: string | null;
  hoverCell: { row: number; col: number } | null;
  activeToolMode: 'PROBE_DMM' | 'INSPECT_NET' | 'FAULT_SANDBOX' | 'CAD_BUILD';
  activeBrushTileId: string;
  redProbe: { row: number; col: number };
  blackProbe: { row: number; col: number };
  xrayCopperMode: boolean;
  thermalIrMode: boolean;
  animTimeSec: number;
  cameraZoom: number;
}) {
  const {
    ctx,
    schema,
    solution,
    spriteCache,
    selectedComponentId,
    highlightedNetId,
    hoverCell,
    activeToolMode,
    activeBrushTileId,
    redProbe,
    blackProbe,
    xrayCopperMode,
    thermalIrMode,
    animTimeSec,
    cameraZoom
  } = params;

  ctx.imageSmoothingEnabled = false;

  // 0. Draw thick 3D Laminated PCB Outer Skirt under the 16x16 diamond perimeter
  const topCorner = cellToIsoWorld(0, 0);
  const rightCorner = cellToIsoWorld(0, ISO_COLS - 1);
  const bottomCorner = cellToIsoWorld(ISO_ROWS - 1, ISO_COLS - 1);
  const leftCorner = cellToIsoWorld(ISO_ROWS - 1, 0);

  const boardTopX = topCorner.cx;
  const boardTopY = topCorner.cy - 32;
  const boardRightX = rightCorner.cx + 64;
  const boardRightY = rightCorner.cy;
  const boardBotX = bottomCorner.cx;
  const boardBotY = bottomCorner.cy + 32;
  const boardLeftX = leftCorner.cx - 64;
  const boardLeftY = leftCorner.cy;
  const skirtDepth = 22;

  // Drop shadow beneath floating 3D PCB
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.moveTo(boardTopX, boardTopY + 34);
  ctx.lineTo(boardRightX + 12, boardRightY + 34);
  ctx.lineTo(boardBotX, boardBotY + 38);
  ctx.lineTo(boardLeftX - 12, boardLeftY + 34);
  ctx.closePath();
  ctx.fill();

  // Left (SW) 8-layer FR-4 + Internal Copper Core Bevel
  ctx.fillStyle = '#062219';
  ctx.beginPath();
  ctx.moveTo(boardLeftX, boardLeftY);
  ctx.lineTo(boardBotX, boardBotY);
  ctx.lineTo(boardBotX, boardBotY + skirtDepth);
  ctx.lineTo(boardLeftX, boardLeftY + skirtDepth);
  ctx.closePath();
  ctx.fill();

  // Copper inner layer striations on SW edge
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(boardLeftX, boardLeftY + 9);
  ctx.lineTo(boardBotX, boardBotY + 9);
  ctx.moveTo(boardLeftX, boardLeftY + 15);
  ctx.lineTo(boardBotX, boardBotY + 15);
  ctx.stroke();

  // Right (SE) 8-layer FR-4 + Internal Copper Core Bevel
  ctx.fillStyle = '#041610';
  ctx.beginPath();
  ctx.moveTo(boardBotX, boardBotY);
  ctx.lineTo(boardRightX, boardRightY);
  ctx.lineTo(boardRightX, boardRightY + skirtDepth);
  ctx.lineTo(boardBotX, boardBotY + skirtDepth);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#b45309';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(boardBotX, boardBotY + 9);
  ctx.lineTo(boardRightX, boardRightY + 9);
  ctx.moveTo(boardBotX, boardBotY + 15);
  ctx.lineTo(boardRightX, boardRightY + 15);
  ctx.stroke();

  // 1. Painter's Algorithm Depth-Sorted Isometric Tile Pass (depth = row + col from 0 to 30)
  for (let depth = 0; depth <= ISO_ROWS + ISO_COLS - 2; depth++) {
    for (let r = 0; r < ISO_ROWS; r++) {
      const c = depth - r;
      if (c < 0 || c >= ISO_COLS) continue;

      const cellVal = schema.gridLayout[r][c];
      const comp: PCBComponentNode | undefined = schema.components[cellVal];
      const { ox, oy, cx, cy } = cellToIsoWorld(r, c);

      // Draw base substrate first if this cell holds a component
      if (comp) {
        const subImg = spriteCache.sub_fr4_emerald;
        if (subImg && subImg.complete) {
          ctx.drawImage(subImg, ox, oy);
        }
      }

      const spriteId = comp ? comp.tileTypeId : cellVal;
      const img = spriteCache[spriteId] || spriteCache.sub_fr4_emerald;
      if (img && img.complete) {
        ctx.save();
        if (xrayCopperMode && comp && comp.category !== 'connector') {
          ctx.globalAlpha = 0.42;
        }
        ctx.drawImage(img, ox, oy);
        ctx.restore();
      }

      // Draw Silkscreen Component Designator & Spec Badge
      if (comp) {
        const isSelected = selectedComponentId === comp.id;
        const isOnActiveNet =
          highlightedNetId &&
          (comp.primaryNetId === highlightedNetId ||
            comp.secondaryNetId === highlightedNetId ||
            comp.pins.some((p) => p.netId === highlightedNetId));
        const hasFault =
          comp.electrical.activeFault && comp.electrical.activeFault.faultType !== 'NONE';

        // Highlight diamond base if selected or part of active netlist
        if (isSelected || isOnActiveNet) {
          const netColor =
            (highlightedNetId && schema.netlists[highlightedNetId]?.highlightColor) || '#f59e0b';
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ox + 64, oy + 64);
          ctx.lineTo(ox + 128, oy + 96);
          ctx.lineTo(ox + 64, oy + 128);
          ctx.lineTo(ox, oy + 96);
          ctx.closePath();
          ctx.fillStyle = isSelected ? 'rgba(251, 191, 36, 0.28)' : `${netColor}33`;
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#fbbf24' : netColor;
          ctx.lineWidth = isSelected ? 2.5 : 1.8;
          ctx.stroke();
          ctx.restore();
        }

        // Fault indicator outline if faulted and in Fault Sandbox or Thermal mode
        if (hasFault && (activeToolMode === 'FAULT_SANDBOX' || thermalIrMode)) {
          ctx.save();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(ox + 64, oy + 62);
          ctx.lineTo(ox + 126, oy + 96);
          ctx.lineTo(ox + 64, oy + 130);
          ctx.lineTo(ox + 2, oy + 96);
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }

        // Crisp silkscreen callout tag above component
        const labelY = cy - (comp.category === 'power' || comp.category === 'ic' ? 28 : 16);
        ctx.save();
        ctx.font = '600 9px "JetBrains Mono", monospace';
        const textWidth = ctx.measureText(comp.id).width;
        ctx.fillStyle = isSelected
          ? '#fbbf24'
          : isOnActiveNet
            ? '#10b981'
            : 'rgba(15, 23, 42, 0.84)';
        ctx.fillRect(cx - textWidth / 2 - 4, labelY - 8, textWidth + 8, 12);
        ctx.strokeStyle = isSelected ? '#141312' : 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(cx - textWidth / 2 - 4, labelY - 8, textWidth + 8, 12);

        ctx.fillStyle = isSelected || isOnActiveNet ? '#090d16' : '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(comp.id, cx, labelY + 1);
        ctx.restore();
      }
    }
  }

  // 2. Render Logical Copper Netlist Routing & Animated Current Flow Pulses
  Object.values(schema.netlists).forEach((net) => {
    if (net.netId === 'GND' && !xrayCopperMode && highlightedNetId !== 'GND') return;

    const isHighlighted = highlightedNetId === net.netId;
    if (!xrayCopperMode && !isHighlighted && net.routedCells.length === 0) return;

    const netSol = solution.netSolutions[net.netId];
    const isShorted = netSol?.status === 'SHORT_TO_GND';
    const isLeaking = netSol?.status === 'RAIL_LEAKAGE';

    // Gather ordered coordinates of routed cells + connected components for vector trace overlay
    const pts: Array<{ x: number; y: number }> = [];
    net.routedCells.forEach((rc) => {
      const p = cellToIsoWorld(rc.row, rc.col);
      pts.push({ x: p.cx, y: p.cy });
    });

    if (pts.length >= 2 && (isHighlighted || xrayCopperMode)) {
      ctx.save();
      ctx.strokeStyle = isShorted
        ? '#ef4444'
        : isLeaking
          ? '#f59e0b'
          : net.highlightColor;
      ctx.lineWidth = isHighlighted ? 4.5 : 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = isHighlighted ? 0.92 : 0.55;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      // Animated current / signal propagation particles along the netlist
      if (animTimeSec > 0 && (solution.powerConnected || isHighlighted)) {
        for (let seg = 0; seg < pts.length - 1; seg++) {
          const p0 = pts[seg];
          const p1 = pts[seg + 1];
          const t = (animTimeSec * 1.6 + seg * 0.27) % 1.0;
          const px = p0.x + (p1.x - p0.x) * t;
          const py = p0.y + (p1.y - p0.y) * t;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(px, py, isHighlighted ? 3.2 : 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  });

  // 3. Thermal IR Camera Overlay (Joule Heating Heatmap)
  if (thermalIrMode) {
    Object.values(schema.components).forEach((comp) => {
      const tempC = solution.componentTemperaturesC[comp.id] ?? solution.ambientTempC;
      const { cx, cy } = cellToIsoWorld(comp.bbox.row, comp.bbox.col);
      const isHotspot = tempC > 45.0;

      ctx.save();
      const radius = isHotspot ? 54 : 28;
      const grad = ctx.createRadialGradient(cx, cy - 8, 2, cx, cy - 8, radius);
      if (isHotspot) {
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.28, 'rgba(244, 63, 94, 0.82)');
        grad.addColorStop(0.65, 'rgba(245, 158, 11, 0.45)');
        grad.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
      } else {
        grad.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
        grad.addColorStop(1, 'rgba(30, 58, 138, 0.0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy - 8, radius, 0, Math.PI * 2);
      ctx.fill();

      if (isHotspot || tempC > 30.0) {
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillStyle = isHotspot ? '#ef4444' : '#0284c7';
        ctx.fillRect(cx - 22, cy - 42, 44, 13);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${tempC.toFixed(1)}°C`, cx, cy - 33);
      }
      ctx.restore();
    });
  }

  // 4. Hover Diamond Outline & CAD Brush Ghost Preview
  if (hoverCell) {
    const { ox, oy } = cellToIsoWorld(hoverCell.row, hoverCell.col);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ox + 64, oy + 64);
    ctx.lineTo(ox + 128, oy + 96);
    ctx.lineTo(ox + 64, oy + 128);
    ctx.lineTo(ox, oy + 96);
    ctx.closePath();
    ctx.strokeStyle = '#e2b474';
    ctx.lineWidth = Math.max(1.5, 2 / cameraZoom);
    ctx.stroke();
    ctx.fillStyle = 'rgba(226, 180, 116, 0.16)';
    ctx.fill();

    if (activeToolMode === 'CAD_BUILD' && spriteCache[activeBrushTileId]) {
      ctx.globalAlpha = 0.65;
      ctx.drawImage(spriteCache[activeBrushTileId], ox, oy);
    }
    ctx.restore();
  }

  // 5. Render 3D Isometric Digital Multimeter Probes (Black COM Probe & Red V/Ω Probe)
  const draw3DMultimeterProbe = (
    row: number,
    col: number,
    probeColor: string,
    bodyDarkColor: string,
    badgeLabel: string,
    tiltX: number
  ) => {
    const { cx, cy } = cellToIsoWorld(row, col);
    const tipX = cx;
    const tipY = cy - 6;

    ctx.save();
    // Target pulse ring on pad
    ctx.strokeStyle = probeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(tipX, tipY + 2, 12, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Metallic needle tip
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX + tiltX * 0.28, tipY - 22);
    ctx.stroke();

    // Insulated 3D probe handle shaft
    ctx.strokeStyle = bodyDarkColor;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tipX + tiltX * 0.28, tipY - 22);
    ctx.lineTo(tipX + tiltX, tipY - 76);
    ctx.stroke();

    ctx.strokeStyle = probeColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tipX + tiltX * 0.28, tipY - 22);
    ctx.lineTo(tipX + tiltX, tipY - 76);
    ctx.stroke();

    // Probe flag badge
    const bx = tipX + tiltX;
    const by = tipY - 88;
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    const bw = ctx.measureText(badgeLabel).width + 12;
    ctx.fillStyle = bodyDarkColor;
    ctx.fillRect(bx - bw / 2, by - 10, bw, 16);
    ctx.strokeStyle = probeColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx - bw / 2, by - 10, bw, 16);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(badgeLabel, bx, by + 1);
    ctx.restore();
  };

  draw3DMultimeterProbe(
    blackProbe.row,
    blackProbe.col,
    '#94a3b8',
    '#1e293b',
    `COM (-) R${blackProbe.row}:C${blackProbe.col}`,
    -26
  );
  draw3DMultimeterProbe(
    redProbe.row,
    redProbe.col,
    '#ef4444',
    '#7f1d1d',
    `RED (+) R${redProbe.row}:C${redProbe.col}`,
    26
  );
}
