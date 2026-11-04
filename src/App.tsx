import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import './styles.css';
import {
  PCBBoardSchema,
  PCB_PALETTE_TILES,
  ComponentCategory,
  createDefaultPCBBoardSchema
} from './engine/pcbSchema';
import {
  SAMPLE_KICAD_BRD_SOURCE,
  parseCADNetlistToSchema,
  CADParseDiagnostic
} from './engine/cadParser';
import {
  MultimeterMode,
  solveBoardElectricalState,
  evaluateProbeMeasurement,
  resolveGridCellTarget
} from './engine/diagnosticsEngine';
import {
  FAULT_PROGRESSION_MATRIX,
  applyFaultScenarioToBoard,
  injectCustomComponentFault
} from './engine/faultSandbox';
import {
  ISO_ROWS,
  ISO_COLS,
  HALF_W,
  QUARTER_W,
  PAD,
  ORIGIN_X,
  ORIGIN_Y,
  WORLD_CENTER_X,
  WORLD_CENTER_Y,
  generateAllPCBTileSprites,
  renderIsometricPCBScene
} from './engine/isoPixelRenderer';

export default function App() {
  // 1. Core PCB Digital Twin Graph State
  const [boardSchema, setBoardSchema] = useState<PCBBoardSchema>(() => {
    const initial = createDefaultPCBBoardSchema();
    // Start in Level 2 (0.6 Ohm Standby Short on C704) so user immediately sees live diagnostics in action
    return applyFaultScenarioToBoard(initial, 'level_2_standby_short').updatedSchema;
  });
  const [activeScenarioId, setActiveScenarioId] = useState<string>('level_2_standby_short');
  const [powerConnected, setPowerConnected] = useState<boolean>(true);
  const [dmmMode, setDmmMode] = useState<MultimeterMode>('VOLTAGE_DC');

  // 2. 3D Isometric Interaction & Probe State
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>('C704');
  const [highlightedNetId, setHighlightedNetId] = useState<string | null>('PP3V3_G3H');
  const [redProbe, setRedProbe] = useState<{ row: number; col: number }>({ row: 10, col: 4 }); // TP_3V3_G3H
  const [blackProbe, setBlackProbe] = useState<{ row: number; col: number }>({ row: 14, col: 1 }); // GND_M3
  const [activeToolMode, setActiveToolMode] = useState<'PROBE_DMM' | 'CAD_BUILD'>('PROBE_DMM');
  const [activeBrushTileId, setActiveBrushTileId] = useState<string>('ic_u701_isl9240');
  const [paletteFilter, setPaletteFilter] = useState<'all' | ComponentCategory>('all');

  // 3. Visual Overlays & Animation State
  const [isAnimated, setIsAnimated] = useState<boolean>(true);
  const [xrayCopperMode, setXrayCopperMode] = useState<boolean>(false);
  const [thermalIrMode, setThermalIrMode] = useState<boolean>(false);
  const [isBottomDockCollapsed, setIsBottomDockCollapsed] = useState<boolean>(false);
  const [repairFeedbackBanner, setRepairFeedbackBanner] = useState<string | null>(null);

  // 4. Modals: CAD/JSON Schema Pipeline & PNG Snapshot
  const [isCadModalOpen, setIsCadModalOpen] = useState<boolean>(false);
  const [cadEditorTab, setCadEditorTab] = useState<'KICAD_DSL' | 'JSON_SCHEMA'>('KICAD_DSL');
  const [cadTextInput, setCadTextInput] = useState<string>(SAMPLE_KICAD_BRD_SOURCE);
  const [cadDiagnostics, setCadDiagnostics] = useState<CADParseDiagnostic[]>([]);

  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotCopied, setSnapshotCopied] = useState<boolean>(false);

  // 5. Canvas & Camera Refs
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: 0.9 });
  const [zoomPercent, setZoomPercent] = useState<number>(90);
  const hoverCellRef = useRef<{ row: number; col: number } | null>(null);
  const [hoverStatusText, setHoverStatusText] = useState<string>(
    'Click any 3D component or test point to probe (+) and highlight its netlist • Shift+Click to move Black COM (-)'
  );
  const spriteDataRef = useRef<{
    staticUris: Record<string, string>;
    imageElements: Record<string, HTMLImageElement>;
  } | null>(null);
  const [spritesReady, setSpritesReady] = useState<boolean>(false);
  const animTimeRef = useRef<number>(0);

  // Generate 2:1 dimetric 3D pixel-art sprites once on mount
  useEffect(() => {
    spriteDataRef.current = generateAllPCBTileSprites();
    setSpritesReady(true);
  }, []);

  // Solve nodal electrical telemetry whenever board, power, or faults change
  const electricalSolution = useMemo(
    () => solveBoardElectricalState(boardSchema, powerConnected, 0),
    [boardSchema, powerConnected]
  );

  // Evaluate Digital Multimeter probe reading
  const probeReading = useMemo(
    () =>
      evaluateProbeMeasurement(
        boardSchema,
        electricalSolution,
        dmmMode,
        redProbe,
        blackProbe
      ),
    [boardSchema, electricalSolution, dmmMode, redProbe, blackProbe]
  );

  const activeScenario = useMemo(
    () =>
      FAULT_PROGRESSION_MATRIX.find((s) => s.scenarioId === activeScenarioId) ||
      FAULT_PROGRESSION_MATRIX[0],
    [activeScenarioId]
  );

  const selectedComponent = useMemo(
    () => (selectedComponentId ? boardSchema.components[selectedComponentId] || null : null),
    [boardSchema, selectedComponentId]
  );

  const activeBrushDef = useMemo(
    () => PCB_PALETTE_TILES.find((t) => t.id === activeBrushTileId) || PCB_PALETTE_TILES[0],
    [activeBrushTileId]
  );

  // Center Camera helper
  const centerCamera = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const worldW = (ISO_ROWS + ISO_COLS) * HALF_W + 2 * PAD;
    const worldH = HALF_W + (ISO_ROWS + ISO_COLS) * QUARTER_W + 2 * PAD;
    const isMobile = window.innerWidth <= 768;
    const fitZoom = Math.min(rect.width / worldW, rect.height / worldH) * (isMobile ? 0.95 : 0.88);
    const clampedZoom = Math.min(Math.max(fitZoom, isMobile ? 0.22 : 0.42), 1.35);

    cameraRef.current.zoom = clampedZoom;
    cameraRef.current.x = rect.width / 2 - WORLD_CENTER_X * clampedZoom;
    cameraRef.current.y = rect.height / 2 - WORLD_CENTER_Y * clampedZoom - (isMobile ? 0 : 28);
    setZoomPercent(Math.round(clampedZoom * 100));
  }, []);

  // Coordinate conversions matching studioEngine.js
  const screenToWorld = (sx: number, sy: number) => ({
    x: (sx - cameraRef.current.x) / cameraRef.current.zoom,
    y: (sy - cameraRef.current.y) / cameraRef.current.zoom
  });

  const worldToCell = (wx: number, wy: number): { row: number; col: number } | null => {
    const dx = wx - (ORIGIN_X + HALF_W);
    const dy = wy - (ORIGIN_Y + 3 * QUARTER_W);
    const col = Math.round(dy / 64.0 + dx / 128.0);
    const row = Math.round(dy / 64.0 - dx / 128.0);
    if (row >= 0 && row < ISO_ROWS && col >= 0 && col < ISO_COLS) {
      return { row, col };
    }
    return null;
  };

  // Main Canvas Render Function
  const drawViewport = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const sprites = spriteDataRef.current;
    if (!canvas || !container || !sprites) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Stage background
    ctx.fillStyle = '#121620';
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Camera transform
    ctx.save();
    ctx.translate(cameraRef.current.x, cameraRef.current.y);
    ctx.scale(cameraRef.current.zoom, cameraRef.current.zoom);

    renderIsometricPCBScene({
      ctx,
      schema: boardSchema,
      solution: electricalSolution,
      spriteCache: sprites.imageElements,
      selectedComponentId,
      highlightedNetId,
      hoverCell: hoverCellRef.current,
      activeToolMode,
      activeBrushTileId,
      redProbe,
      blackProbe,
      xrayCopperMode,
      thermalIrMode,
      animTimeSec: isAnimated ? animTimeRef.current : 0,
      cameraZoom: cameraRef.current.zoom
    });

    ctx.restore();
    ctx.restore();
  }, [
    boardSchema,
    electricalSolution,
    selectedComponentId,
    highlightedNetId,
    activeToolMode,
    activeBrushTileId,
    redProbe,
    blackProbe,
    xrayCopperMode,
    thermalIrMode,
    isAnimated
  ]);

  // Center camera on first mount and window resize
  useEffect(() => {
    centerCamera();
    const onResize = () => {
      centerCamera();
      drawViewport();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [centerCamera, drawViewport]);

  // Animation loop for current flow particles and thermal shimmer
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      if (isAnimated) {
        animTimeRef.current += dt;
      }
      drawViewport();
      if (isAnimated) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (isAnimated) {
      rafId = requestAnimationFrame(tick);
    } else {
      drawViewport();
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isAnimated, drawViewport]);

  // Handle cell interaction (Probing, Netlist Highlighting, or CAD Tile Placement)
  const handleCellInteraction = useCallback(
    (row: number, col: number, isSecondaryProbe: boolean) => {
      if (activeToolMode === 'CAD_BUILD') {
        setBoardSchema((prev) => {
          const next: PCBBoardSchema = JSON.parse(JSON.stringify(prev));
          const existingCompId = next.gridLayout[row][col];
          if (next.components[existingCompId]) {
            delete next.components[existingCompId];
          }
          const tileDef = PCB_PALETTE_TILES.find((t) => t.id === activeBrushTileId);
          if (!tileDef) return prev;

          if (tileDef.category === 'substrate' || tileDef.category === 'trace') {
            next.gridLayout[row][col] = tileDef.id;
          } else {
            const newId = `${tileDef.code}_R${row}C${col}`;
            next.components[newId] = {
              id: newId,
              tileTypeId: tileDef.id,
              label: tileDef.label,
              partSpec: tileDef.packageType,
              packageType: tileDef.packageType,
              category: tileDef.category,
              bbox: { row, col, widthMm: 2.5, lengthMm: 2.5, heightMm: 1.0, rotationDeg: 0 },
              pins: [
                {
                  pinId: '1',
                  name: tileDef.defaultNetId,
                  netId: tileDef.defaultNetId,
                  isoOffset: { dx: 0, dy: 0 },
                  nominalDiodeDropV: 0.44
                }
              ],
              primaryNetId: tileDef.defaultNetId,
              electrical: { internalResistanceToGndOhms: 85000, seriesResistanceOhms: 0.05 },
              doc: tileDef.doc
            };
            next.gridLayout[row][col] = newId;
            setSelectedComponentId(newId);
            setHighlightedNetId(tileDef.defaultNetId);
          }
          return next;
        });
        return;
      }

      // PROBE_DMM Mode: Place Black COM probe if Shift/Right-click, otherwise place Red (+) probe & select component/net
      if (isSecondaryProbe) {
        setBlackProbe({ row, col });
        return;
      }

      setRedProbe({ row, col });
      const resolved = resolveGridCellTarget(boardSchema, row, col);
      if (resolved.component) {
        setSelectedComponentId(resolved.component.id);
        setHighlightedNetId(resolved.component.primaryNetId);
      } else if (resolved.netId !== 'ISOLATED') {
        setHighlightedNetId(resolved.netId);
      }
    },
    [activeToolMode, activeBrushTileId, boardSchema]
  );

  // Canvas Pan, Zoom & Pointer Handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isPanning = false;
    let isSpacePressed = false;
    let panStartX = 0;
    let panStartY = 0;
    let downX = 0;
    let downY = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const oldZoom = cameraRef.current.zoom;
      const newZoom = Math.min(Math.max(oldZoom * zoomFactor, 0.25), 3.0);

      cameraRef.current.x = mouseX - (mouseX - cameraRef.current.x) * (newZoom / oldZoom);
      cameraRef.current.y = mouseY - (mouseY - cameraRef.current.y) * (newZoom / oldZoom);
      cameraRef.current.zoom = newZoom;
      setZoomPercent(Math.round(newZoom * 100));
      drawViewport();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'INPUT'
      ) {
        isSpacePressed = true;
        container.classList.add('panning');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressed = false;
        if (!isPanning) container.classList.remove('panning');
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      downX = mx;
      downY = my;

      if (e.button === 1 || isSpacePressed) {
        isPanning = true;
        panStartX = mx - cameraRef.current.x;
        panStartY = my - cameraRef.current.y;
        container.classList.add('panning');
        return;
      }

      const world = screenToWorld(mx, my);
      const cell = worldToCell(world.x, world.y);

      if (!cell || e.button === 2) {
        isPanning = true;
        panStartX = mx - cameraRef.current.x;
        panStartY = my - cameraRef.current.y;
        container.classList.add('panning');
        return;
      }

      if (e.button === 0) {
        handleCellInteraction(cell.row, cell.col, e.shiftKey);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (isPanning) {
        cameraRef.current.x = mx - panStartX;
        cameraRef.current.y = my - panStartY;
        drawViewport();
        return;
      }

      const world = screenToWorld(mx, my);
      const cell = worldToCell(world.x, world.y);
      hoverCellRef.current = cell;

      if (cell) {
        const resolved = resolveGridCellTarget(boardSchema, cell.row, cell.col);
        setHoverStatusText(
          `R${cell.row}:C${cell.col} • ${resolved.label} [${resolved.netId}] — Click: Probe (+) • Shift+Click: COM (-)`
        );
      } else {
        setHoverStatusText(
          'Drag outside board or hold Space to pan • Scroll to zoom • Click any component to probe'
        );
      }
      if (!isAnimated) drawViewport();
    };

    const onMouseUp = () => {
      if (isPanning) {
        isPanning = false;
        if (!isSpacePressed) container.classList.remove('panning');
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      if (Math.hypot(mx - downX, my - downY) < 6) {
        const world = screenToWorld(mx, my);
        const cell = worldToCell(world.x, world.y);
        if (cell) {
          handleCellInteraction(cell.row, cell.col, true);
        }
      }
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('contextmenu', onContextMenu);

    return () => {
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('contextmenu', onContextMenu);
    };
  }, [boardSchema, handleCellInteraction, isAnimated, drawViewport]);

  // Switch Fault Progression Scenario
  const handleSelectScenario = (scenarioId: string) => {
    setRepairFeedbackBanner(null);
    setActiveScenarioId(scenarioId);
    const base = createDefaultPCBBoardSchema();
    const { updatedSchema, activeScenario: sc } = applyFaultScenarioToBoard(base, scenarioId);
    setBoardSchema(updatedSchema);
    setHighlightedNetId(sc.affectedNetId);

    const net = updatedSchema.netlists[sc.affectedNetId];
    if (net) {
      setRedProbe({
        row: net.telemetryExpectation.recommendedProbePoint.row,
        col: net.telemetryExpectation.recommendedProbePoint.col
      });
    }
    if (sc.targetComponentId) {
      setSelectedComponentId(sc.targetComponentId);
    }
  };

  // Hot-Air Rework & Component Replacement Handler
  const handleReworkComponent = (compId: string) => {
    const comp = boardSchema.components[compId];
    if (!comp) return;
    const hadFault =
      comp.electrical.activeFault && comp.electrical.activeFault.faultType !== 'NONE';

    const repaired = injectCustomComponentFault(boardSchema, compId, 'NONE', 0);
    setBoardSchema(repaired);

    if (hadFault) {
      setRepairFeedbackBanner(
        `REWORK VERIFIED: Replaced faulty ${comp.id} (${comp.partSpec}). Rail ${comp.primaryNetId} restored to nominal specification!`
      );
    } else {
      setRepairFeedbackBanner(
        `Replaced ${comp.id}, but ${comp.id} had no active internal fault. Continue probing to isolate the root culprit.`
      );
    }
  };

  // Zoom button helpers
  const adjustZoom = (factor: number, reset = false) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const oldZoom = cameraRef.current.zoom;
    const newZoom = reset ? 1.0 : Math.min(Math.max(oldZoom * factor, 0.25), 3.0);
    cameraRef.current.x = cx - (cx - cameraRef.current.x) * (newZoom / oldZoom);
    cameraRef.current.y = cy - (cy - cameraRef.current.y) * (newZoom / oldZoom);
    cameraRef.current.zoom = newZoom;
    setZoomPercent(Math.round(newZoom * 100));
    drawViewport();
  };

  // Execute 1:1 PNG Snapshot Export
  const handleExportSnapshot = () => {
    const sprites = spriteDataRef.current;
    if (!sprites) return;
    const worldW = (ISO_ROWS + ISO_COLS) * HALF_W + 2 * PAD;
    const worldH = HALF_W + (ISO_ROWS + ISO_COLS) * QUARTER_W + 2 * PAD;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = worldW;
    offCanvas.height = worldH;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    offCtx.fillStyle = '#121620';
    offCtx.fillRect(0, 0, worldW, worldH);

    renderIsometricPCBScene({
      ctx: offCtx,
      schema: boardSchema,
      solution: electricalSolution,
      spriteCache: sprites.imageElements,
      selectedComponentId,
      highlightedNetId,
      hoverCell: null,
      activeToolMode,
      activeBrushTileId,
      redProbe,
      blackProbe,
      xrayCopperMode,
      thermalIrMode,
      animTimeSec: animTimeRef.current,
      cameraZoom: 1.0
    });

    const dataUrl = offCanvas.toDataURL('image/png');
    setSnapshotUrl(dataUrl);
  };

  // Compile CAD Netlist / JSON Schema in Modal
  const handleCompileCadInput = () => {
    const res = parseCADNetlistToSchema(cadTextInput);
    setCadDiagnostics(res.diagnostics);
    if (res.success) {
      setBoardSchema(res.schema);
      setRepairFeedbackBanner(
        `CAD PIPELINE COMPILED: ${res.stats.componentCount} 3D components & ${res.stats.netCount} nets mapped in ${res.stats.parseDurationMs.toFixed(1)}ms.`
      );
    }
  };

  const filteredPaletteTiles = useMemo(
    () =>
      PCB_PALETTE_TILES.filter(
        (t) => paletteFilter === 'all' || t.category === paletteFilter
      ),
    [paletteFilter]
  );

  const statusColorMap = {
    NOMINAL: '#10b981',
    SHORT_TO_GND: '#ef4444',
    OPEN_LINE: '#f59e0b',
    RAIL_LEAKAGE: '#ec4899',
    UNDERVOLTAGE: '#38bdf8'
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      {/* Top Studio Utility Bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="top-bar-title">Isometric PCB Digital Twin</span>
          <span className="top-bar-subtitle">
            {boardSchema.boardId} &bull; 16&times;16 2:1 Dimetric 3D &bull;{' '}
            {Object.keys(boardSchema.components).length} Nodes
          </span>
        </div>

        <div className="top-bar-center">
          <div className="top-bar-status" title={hoverStatusText}>
            {hoverStatusText}
          </div>
        </div>

        <div className="top-bar-right">
          <button
            type="button"
            className={`builder-text-btn ${powerConnected ? 'active' : ''}`}
            onClick={() => setPowerConnected((p) => !p)}
            title="Toggle 20.5V Bench USB-C Power Supply"
          >
            {powerConnected
              ? `PSU 20.5V (${electricalSolution.psuCurrentDrawA.toFixed(2)}A)`
              : 'PSU: OFF (0V)'}
          </button>

          <button
            type="button"
            className={`builder-text-btn ${xrayCopperMode ? 'active' : ''}`}
            onClick={() => setXrayCopperMode((x) => !x)}
            title="Toggle X-Ray Copper Trace Layer Visibility"
          >
            X-Ray Traces
          </button>

          <button
            type="button"
            className={`builder-text-btn ${thermalIrMode ? 'active' : ''}`}
            onClick={() => setThermalIrMode((t) => !t)}
            title="Toggle Thermal IR Camera Overlay"
          >
            Thermal IR
          </button>

          <button
            type="button"
            className={`builder-text-btn ${isAnimated ? 'active' : ''}`}
            onClick={() => setIsAnimated((a) => !a)}
          >
            {isAnimated ? 'Signal Flow' : 'Paused'}
          </button>

          <button
            type="button"
            className="builder-text-btn"
            onClick={() => {
              setCadEditorTab('KICAD_DSL');
              setCadTextInput(SAMPLE_KICAD_BRD_SOURCE);
              setIsCadModalOpen(true);
            }}
          >
            CAD / JSON Schema
          </button>

          <div className="zoom-group">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => adjustZoom(0.8)}
              title="Zoom out"
            >
              &minus;
            </button>
            <span
              className="zoom-readout"
              onClick={() => adjustZoom(1, true)}
              title="Reset zoom to 100%"
            >
              {zoomPercent}%
            </span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => adjustZoom(1.25)}
              title="Zoom in"
            >
              &plus;
            </button>
          </div>

          <button type="button" className="builder-text-btn" onClick={centerCamera}>
            Center view
          </button>

          <button
            type="button"
            className="builder-action-btn primary"
            onClick={handleExportSnapshot}
          >
            Snapshot PNG
          </button>
        </div>
      </header>

      {/* Left Fixed Control Panel / Sidebar */}
      <aside className="builder-sidebar" id="builder-sidebar">
        {/* 1. Practice Mode — Fault Progression Matrix */}
        <div className="sidebar-section-presets">
          <div className="sidebar-header">
            <span>Fault Simulation Progression Matrix</span>
            <span>Practice Mode</span>
          </div>
          <div className="preset-pill-grid">
            {FAULT_PROGRESSION_MATRIX.map((sc) => (
              <button
                key={sc.scenarioId}
                type="button"
                className={`preset-pill ${activeScenarioId === sc.scenarioId ? 'active' : ''}`}
                onClick={() => handleSelectScenario(sc.scenarioId)}
                title={sc.title}
              >
                {sc.shortTag}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Digital Multimeter (DMM) Telemetry Console ("Test Mode") */}
        <div className="dmm-instrument-card">
          <div className="sidebar-header" style={{ color: '#94a3b8', marginBottom: 0 }}>
            <span>Bench Digital Multimeter (Test Mode)</span>
            <span style={{ color: statusColorMap[probeReading.status] }}>
              {probeReading.status.replace(/_/g, ' ')}
            </span>
          </div>

          <div className="dmm-lcd-screen">
            <div className="dmm-lcd-top-row">
              <div>
                <span
                  className="dmm-lcd-value"
                  style={{ color: statusColorMap[probeReading.status] }}
                >
                  {probeReading.displayValue}
                </span>
                <span className="dmm-lcd-unit">{probeReading.unit}</span>
              </div>
              <span className="dmm-lcd-expected">
                RED: {probeReading.redProbe.targetId}
              </span>
            </div>
            <div className="dmm-lcd-expected">
              Expected: {probeReading.expectedValueText}
            </div>
          </div>

          <div className="dmm-mode-tabs">
            {(
              [
                ['VOLTAGE_DC', 'V DC'],
                ['RESISTANCE_OHM', 'Ω GND'],
                ['DIODE_DROP', 'Diode V'],
                ['THERMAL_TEMP', 'Temp °C']
              ] as Array<[MultimeterMode, string]>
            ).map(([mKey, mLabel]) => (
              <button
                key={mKey}
                type="button"
                className={`dmm-mode-btn ${dmmMode === mKey ? 'active' : ''}`}
                onClick={() => setDmmMode(mKey)}
              >
                {mLabel}
              </button>
            ))}
          </div>

          <div className="dmm-verdict-strip">
            <div
              className="dmm-verdict-title"
              style={{ color: statusColorMap[probeReading.status] }}
            >
              {probeReading.verdictTitle}
            </div>
            <div style={{ color: '#cbd5e1' }}>{probeReading.verdictDetail}</div>
          </div>
        </div>

        {/* 3. Selected 3D Component Inspector & Fault Sandbox Actions */}
        <div className="sidebar-brush-card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div className="brush-thumb-wrap">
              {spritesReady && spriteDataRef.current && (
                <img
                  className="brush-thumb pixelated"
                  src={
                    spriteDataRef.current.staticUris[
                      selectedComponent ? selectedComponent.tileTypeId : activeBrushDef.id
                    ]
                  }
                  alt={selectedComponent ? selectedComponent.label : activeBrushDef.label}
                />
              )}
            </div>
            <div className="brush-info">
              <div className="brush-title">
                {selectedComponent
                  ? `${selectedComponent.id} — ${selectedComponent.label}`
                  : activeBrushDef.label}
              </div>
              <div className="brush-meta">
                {selectedComponent
                  ? `${selectedComponent.partSpec} · Net: ${selectedComponent.primaryNetId} · R${selectedComponent.bbox.row}:C${selectedComponent.bbox.col}`
                  : `${activeBrushDef.code} · ${activeBrushDef.packageType}`}
              </div>
              <div className="brush-doc">
                {selectedComponent ? selectedComponent.doc : activeBrushDef.doc}
              </div>
            </div>
          </div>

          {selectedComponent && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '0.45rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="preset-pill active"
                style={{ flex: 1, padding: '4px 8px', fontSize: '0.72rem' }}
                onClick={() => handleReworkComponent(selectedComponent.id)}
              >
                Rework &amp; Replace {selectedComponent.id}
              </button>
              <button
                type="button"
                className="preset-pill"
                style={{ padding: '4px 7px', fontSize: '0.71rem' }}
                onClick={() => {
                  const next = injectCustomComponentFault(
                    boardSchema,
                    selectedComponent.id,
                    'DEAD_SHORT_GND',
                    0.6
                  );
                  setBoardSchema(next);
                  setRepairFeedbackBanner(
                    `SANDBOX FAULT INJECTED: ${selectedComponent.id} shorted to GND (0.60 Ω).`
                  );
                }}
              >
                Inject 0.6Ω Short
              </button>
              <button
                type="button"
                className="preset-pill"
                style={{ padding: '4px 7px', fontSize: '0.71rem' }}
                onClick={() => {
                  const next = injectCustomComponentFault(
                    boardSchema,
                    selectedComponent.id,
                    'BLOWN_FUSE_OPEN',
                    9999999
                  );
                  setBoardSchema(next);
                  setRepairFeedbackBanner(
                    `SANDBOX FAULT INJECTED: ${selectedComponent.id} blown open (OL).`
                  );
                }}
              >
                Blow Open
              </button>
            </div>
          )}
        </div>

        {/* 4. Tool Mode & Component Palette Categories */}
        <div className="sidebar-section-categories">
          <div className="sidebar-header">
            <span>3D Component &amp; Trace Library</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className={`category-pill ${activeToolMode === 'PROBE_DMM' ? 'active' : ''}`}
                onClick={() => setActiveToolMode('PROBE_DMM')}
              >
                Probe Mode
              </button>
              <button
                type="button"
                className={`category-pill ${activeToolMode === 'CAD_BUILD' ? 'active' : ''}`}
                onClick={() => setActiveToolMode('CAD_BUILD')}
              >
                Place 3D Tile
              </button>
            </div>
          </div>

          <div className="category-pills-wrap">
            {(
              [
                ['all', `All (${PCB_PALETTE_TILES.length})`],
                ['ic', 'Controllers (5)'],
                ['power', 'Coils & FETs (5)'],
                ['protection', 'Fuses (2)'],
                ['passive', 'MLCC & Shunts (5)'],
                ['connector', 'Ports & Pads (4)'],
                ['trace', 'Traces & Vias (4)'],
                ['substrate', 'FR-4 Base (2)']
              ] as Array<['all' | ComponentCategory, string]>
            ).map(([catKey, catLabel]) => (
              <button
                key={catKey}
                type="button"
                className={`builder-text-btn category-pill ${paletteFilter === catKey ? 'active' : ''}`}
                onClick={() => setPaletteFilter(catKey)}
              >
                {catLabel}
              </button>
            ))}
          </div>
        </div>

        {/* 5. 2:1 Dimetric 3D Component Palette Tray */}
        <div className="sidebar-tray-grid" id="builder-tray">
          {filteredPaletteTiles.map((tile) => (
            <div
              key={tile.id}
              className={`tray-tile ${activeBrushTileId === tile.id ? 'selected' : ''}`}
              title={`${tile.label} (${tile.packageType})`}
              onClick={() => {
                setActiveBrushTileId(tile.id);
                // If an instance of this archetype exists on the board, highlight it
                const matchComp = Object.values(boardSchema.components).find(
                  (c) => c.tileTypeId === tile.id
                );
                if (matchComp && activeToolMode === 'PROBE_DMM') {
                  setSelectedComponentId(matchComp.id);
                  setHighlightedNetId(matchComp.primaryNetId);
                  setRedProbe({ row: matchComp.bbox.row, col: matchComp.bbox.col });
                }
              }}
            >
              {spritesReady && spriteDataRef.current && (
                <img
                  src={spriteDataRef.current.staticUris[tile.id]}
                  width={48}
                  height={48}
                  alt={tile.label}
                  className="pixelated"
                />
              )}
              <span className="tray-tile-code">{tile.code}</span>
              <span className="tray-tile-name">{tile.label}</span>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <span>Click: Probe (+) &bull; Shift/Right-Click: COM (-) &bull; Scroll: Zoom</span>
        </div>
      </aside>

      {/* Main 2:1 Dimetric Isometric 3D Canvas Container */}
      <div id="canvas-container" ref={containerRef}>
        <canvas id="builder-canvas" ref={canvasRef} />

        {/* Collapsible Bottom Netlist Graph & Diagnostic Training Dock */}
        <div className={`stage-bottom-dock ${isBottomDockCollapsed ? 'collapsed' : ''}`}>
          <div className="stage-dock-header">
            <span>
              <strong>{activeScenario.title}</strong> &bull; {activeScenario.complexityLabel}
            </span>
            <button
              type="button"
              className="builder-text-btn"
              style={{ fontSize: '0.72rem' }}
              onClick={() => setIsBottomDockCollapsed((c) => !c)}
            >
              {isBottomDockCollapsed ? '▲ Show Netlist & Steps' : '▼ Hide Dock'}
            </button>
          </div>

          <div className="stage-dock-body">
            <div>
              <div style={{ fontSize: '0.74rem', color: 'var(--ink-secondary)', marginBottom: '0.35rem' }}>
                {repairFeedbackBanner ? (
                  <strong style={{ color: '#059669' }}>{repairFeedbackBanner}</strong>
                ) : (
                  activeScenario.symptomBrief
                )}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--ink)', lineHeight: 1.4 }}>
                {activeScenario.guidedSteps.map((step, idx) => (
                  <div key={idx}>{step}</div>
                ))}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '0.68rem',
                  color: 'var(--ink-muted)',
                  textTransform: 'uppercase'
                }}
              >
                Logical Netlist Explorer (Click to Highlight &amp; Probe Rail)
              </div>
              <div className="net-rail-list">
                {Object.values(boardSchema.netlists).map((net) => {
                  const sol = electricalSolution.netSolutions[net.netId];
                  const isAct = highlightedNetId === net.netId;
                  return (
                    <button
                      key={net.netId}
                      type="button"
                      className={`net-rail-btn ${isAct ? 'active' : ''}`}
                      onClick={() => {
                        setHighlightedNetId(net.netId);
                        const tp = net.telemetryExpectation.recommendedProbePoint;
                        setRedProbe({ row: tp.row, col: tp.col });
                        if (boardSchema.components[tp.designator]) {
                          setSelectedComponentId(tp.designator);
                        }
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: net.highlightColor,
                          display: 'inline-block'
                        }}
                      />
                      <span>{net.netId}</span>
                      <span style={{ opacity: 0.75 }}>
                        {sol ? `${sol.actualVoltageDc.toFixed(1)}V` : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schematic-to-3D CAD Netlist & JSON Schema Pipeline Modal */}
      <div
        className={`snapshot-modal-backdrop ${isCadModalOpen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsCadModalOpen(false);
        }}
      >
        <div className="snapshot-modal-card" style={{ maxWidth: '880px' }}>
          <div className="snapshot-modal-header">
            <div>
              <h2 className="snapshot-modal-title">
                Schematic-to-3D CAD Ingestion &amp; JSON Schema Pipeline
              </h2>
              <p className="snapshot-modal-subtitle">
                Ingest KiCad/BRD netlist directives or inspect the complete typed PCBBoardSchema JSON graph
              </p>
            </div>
            <button
              type="button"
              className="snapshot-modal-close"
              onClick={() => setIsCadModalOpen(false)}
            >
              &times;
            </button>
          </div>

          <div
            className="snapshot-modal-body"
            style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.65rem' }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`snapshot-action-btn ${cadEditorTab === 'KICAD_DSL' ? 'primary' : ''}`}
                onClick={() => {
                  setCadEditorTab('KICAD_DSL');
                  setCadTextInput(SAMPLE_KICAD_BRD_SOURCE);
                }}
              >
                KiCad / BRD Netlist DSL
              </button>
              <button
                type="button"
                className={`snapshot-action-btn ${cadEditorTab === 'JSON_SCHEMA' ? 'primary' : ''}`}
                onClick={() => {
                  setCadEditorTab('JSON_SCHEMA');
                  setCadTextInput(JSON.stringify(boardSchema, null, 2));
                }}
              >
                Live 3D PCB JSON Schema ({Object.keys(boardSchema.components).length} Nodes)
              </button>
            </div>

            <textarea
              className="cad-code-textarea"
              value={cadTextInput}
              onChange={(e) => setCadTextInput(e.target.value)}
              spellCheck={false}
            />

            {cadDiagnostics.length > 0 && (
              <div
                style={{
                  background: '#0b1117',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 4,
                  padding: '0.5rem 0.75rem',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.72rem',
                  color: '#cbd5e1',
                  maxHeight: '90px',
                  overflowY: 'auto'
                }}
              >
                {cadDiagnostics.map((d, i) => (
                  <div key={i}>
                    [{d.severity}] {d.code}: {d.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="snapshot-modal-footer">
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
              <button
                type="button"
                className="snapshot-action-btn primary"
                onClick={handleCompileCadInput}
              >
                Compile &amp; Rebuild 3D Isometric Board
              </button>
              <button
                type="button"
                className="snapshot-action-btn"
                onClick={() => {
                  navigator.clipboard?.writeText(cadTextInput);
                }}
              >
                Copy Schema
              </button>
            </div>
            <button
              type="button"
              className="snapshot-action-link"
              onClick={() => setIsCadModalOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Snapshot Export Preview Modal */}
      <div
        className={`snapshot-modal-backdrop ${snapshotUrl ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSnapshotUrl(null);
        }}
      >
        <div className="snapshot-modal-card">
          <div className="snapshot-modal-header">
            <div>
              <h2 className="snapshot-modal-title">3D PCB Digital Twin Snapshot Exported</h2>
              <p className="snapshot-modal-subtitle">
                2,176 &times; 1,216 pixels &bull; Full 16&times;16 2:1 dimetric board &bull; 1:1 pixel resolution
              </p>
            </div>
            <button
              type="button"
              className="snapshot-modal-close"
              onClick={() => setSnapshotUrl(null)}
            >
              &times;
            </button>
          </div>

          <div className="snapshot-modal-body">
            {snapshotUrl && (
              <img
                src={snapshotUrl}
                className="snapshot-preview-img pixelated"
                alt="16x16 isometric PCB snapshot"
              />
            )}
          </div>

          <div className="snapshot-modal-footer">
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {snapshotUrl && (
                <a
                  href={snapshotUrl}
                  download={`isometric-pcb-${boardSchema.boardId}.png`}
                  className="snapshot-action-btn primary"
                >
                  Download PNG
                </a>
              )}
              <button
                type="button"
                className="snapshot-action-btn"
                onClick={async () => {
                  if (!snapshotUrl) return;
                  try {
                    const res = await fetch(snapshotUrl);
                    const blob = await res.blob();
                    await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': blob })
                    ]);
                    setSnapshotCopied(true);
                    setTimeout(() => setSnapshotCopied(false), 2000);
                  } catch {
                    // Fallback if clipboard API restricted
                  }
                }}
              >
                {snapshotCopied ? 'Copied to clipboard' : 'Copy image'}
              </button>
            </div>
            <button
              type="button"
              className="snapshot-action-link"
              onClick={() => setSnapshotUrl(null)}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
