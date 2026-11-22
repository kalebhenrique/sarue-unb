import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  useReactFlow,
  useStoreApi,
  useViewport,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  Check,
  CircleDotDashed,
  Lock,
  Maximize,
  Unlock,
  ZoomIn,
  ZoomOut,
  CalendarPlus,
  RotateCcw,
} from "lucide-react";
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui";
import type { FlowchartData, FlowchartDiscipline } from "@/core";

type DisciplineStatus = "completed" | "in_progress" | "available" | "locked";

type ToggleFn = (code: string, isEffectivelyCompleted: boolean) => void;

interface DisciplineNodeData extends Record<string, unknown> {
  discipline: FlowchartDiscipline;
  dim: boolean;
  inChain: boolean;
  onToggle: ToggleFn;
  onSendToGrade?: (code: string, name: string) => void;
}

type DisciplineFlowNode = Node<DisciplineNodeData, "discipline">;
type PenEdgeData = { dim: boolean; inChain: boolean };
type PenFlowEdge = Edge<PenEdgeData, "pen">;

export interface FlowchartDiagramProps {
  flowchartData: FlowchartData;
  /** Códigos que passam busca + filtro atuais: os demais esmaecem (cadeias preservadas) */
  visibleCodes: Set<string>;
  onToggle: ToggleFn;
  onSendToGrade?: (code: string, name: string) => void;
}

const NODE_W = 212;
const NODE_H = 78;

// Vocabulário de status do sistema (adesivo por estado, mesmo idioma dos filtros)
const STATUS_STYLE: Record<
  DisciplineStatus,
  { sticker: string; name: string; meta: string; icon: React.ReactNode; label: string }
> = {
  completed: {
    sticker: "bg-neo-green",
    name: "text-ink",
    meta: "text-ink/70",
    icon: <Check className="w-3.5 h-3.5 stroke-[3] text-ink" aria-hidden />,
    label: "Concluída",
  },
  in_progress: {
    sticker: "bg-neo-blue",
    name: "text-white",
    meta: "text-white/90",
    icon: (
      <CircleDotDashed className="w-3.5 h-3.5 stroke-[2.5] text-white" aria-hidden />
    ),
    label: "Cursando neste semestre",
  },
  available: {
    sticker: "bg-neo-yellow",
    name: "text-ink",
    meta: "text-ink/70",
    icon: <Unlock className="w-3.5 h-3.5 stroke-[2.5] text-ink" aria-hidden />,
    label: "Pronta: pré-requisitos concluídos",
  },
  locked: {
    sticker: "bg-neutral-100",
    name: "text-neutral-600",
    meta: "text-neutral-500",
    icon: <Lock className="w-3.5 h-3.5 stroke-[2.5] text-neutral-500" aria-hidden />,
    label: "Bloqueada",
  },
};

const SUPPORTS_HOVER =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(hover: hover)").matches
    : true;

// Nó-adesivo: conteúdo (raio 8px, sombra 4px) com física de card clicável.
// Clique = abre menu com opção de marcar/desmarcar concluída OU enviar para Montar Grade.
const DisciplineNode = React.memo(function DisciplineNode({
  data,
}: NodeProps<DisciplineFlowNode>) {
  const { discipline: d, dim, onToggle, onSendToGrade } = data;
  const status = d.status as DisciplineStatus;
  const s = STATUS_STYLE[status];
  const isCompleted = status === "completed";
  const isOptativa = d.nature === "Optativa";

  let stickerBg = s.sticker;
  let textColor = s.name;
  let metaColor = s.meta;

  if (isOptativa) {
    if (status === "available") {
      stickerBg = "bg-neo-purple";
      textColor = "text-ink";
      metaColor = "text-ink/70";
    } else if (status === "locked") {
      stickerBg = "bg-pastel-purple";
      textColor = "text-neutral-700";
      metaColor = "text-neutral-500";
    } else if (status === "completed") {
      stickerBg = "bg-pastel-purple";
      textColor = "text-black";
      metaColor = "text-black/60";
    }
  }

  const cardInner = (
    <>
      <span
        className={`text-[11px] font-black leading-[1.25] line-clamp-2 ${textColor}`}
        title={d.name}
      >
        {d.name}
      </span>

      <span className="flex items-center gap-1 w-full min-w-0">
        <span className={`text-[11px] font-bold truncate ${metaColor}`}>
          {d.code} • {d.workloadHours}h
        </span>
        <span
          className="ml-auto text-[11px] font-black px-1 py-px bg-paper border border-ink rounded text-black shrink-0"
          title={d.level === 0 ? "Optativa de interesse" : `${d.level}º semestre sugerido`}
        >
          {d.level === 0 ? "OPT" : `${d.level}º`}
        </span>

        {/* Botão rápido no hover: Enviar para o Montar Grade (do lado esquerdo do ícone de status) */}
        {onSendToGrade && (
          <button
            type="button"
            title="Enviar para o Montar Grade"
            onClick={(e) => {
              e.stopPropagation();
              onSendToGrade(d.code, d.name);
            }}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 rounded bg-paper hover:bg-pastel-yellow border border-ink text-black cursor-pointer shadow-neo-xs shrink-0"
          >
            <CalendarPlus className="w-3 h-3 stroke-[2.5]" />
          </button>
        )}

        {/* Ícone de status (cursando, bloqueado, disponível, etc) com clique de toggle rápido */}
        <button
          type="button"
          title={isCompleted ? "Desmarcar disciplina" : "Marcar como concluída"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(d.code, isCompleted);
          }}
          className="cursor-pointer hover:scale-110 transition-transform shrink-0"
        >
          {s.icon}
        </button>
      </span>
    </>
  );

  const cardButton = (
    <button
      type="button"
      aria-label={`Opções para ${d.code} - ${d.name}`}
      className={`group w-[212px] h-[78px] min-h-[78px] p-2 flex flex-col justify-between gap-1 text-left border-2 border-ink rounded-lg shadow-(--neo-card-shadow) cursor-pointer transition-[transform,box-shadow,opacity] duration-150 ease-out hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_var(--neo-shadow)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 select-none ${stickerBg} ${
        dim ? "opacity-30" : "opacity-100"
      }`}
    />
  );

  return (
    <div className="relative">
      <DropdownMenu>
        {SUPPORTS_HOVER ? (
          <Tooltip>
            <TooltipTrigger
              render={<DropdownMenuTrigger render={cardButton} />}
            >
              {cardInner}
            </TooltipTrigger>

            <TooltipContent className="pointer-events-none text-left max-w-[260px]">
              <p className="font-black">{d.name}</p>
              <p className="text-[11px] font-bold text-neutral-600 mb-1">
                {d.code} • {d.workloadHours}h • {d.level === 0 ? "Optativa" : `${d.level}º semestre`} {isOptativa ? "• Optativa de interesse" : ""}
              </p>
              <p className="font-bold">
                {s.label}
                {isCompleted && d.grade ? ` · Nota ${d.grade}` : ""}
              </p>
              {status === "locked" && d.missingPrerequisites.length > 0 && (
                <>
                  <p className="font-black mt-1">Falta:</p>
                  <ul className="space-y-0.5">
                    {d.missingPrerequisites.map((m, i) => (
                      <li key={i} className="font-medium">
                        {m}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {d.prerequisites.length > 0 && status !== "locked" && (
                <p className="font-bold mt-1">
                  {d.prerequisites.length} pré-requisito(s)
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenuTrigger render={cardButton}>
            {cardInner}
          </DropdownMenuTrigger>
        )}

        <DropdownMenuContent side="bottom" align="start" className="w-64 p-1.5 shadow-(--neo-card-shadow) border-2 border-ink bg-paper">
          <div className="px-2 py-1.5 mb-1 border-b-2 border-ink/10">
            <p className="text-xs font-black text-black leading-tight line-clamp-2">
              {d.name}
            </p>
            <span className="text-[11px] font-medium text-neutral-600 mt-0.5 block">
              {d.code} • {d.workloadHours}h
            </span>
          </div>

          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onToggle(d.code, isCompleted);
            }}
            className="gap-2 cursor-pointer"
          >
            {isCompleted ? (
              <>
                <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                <span>Desmarcar como concluída</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3] text-neo-green" />
                <span>Marcar como concluída</span>
              </>
            )}
          </DropdownMenuItem>

          {onSendToGrade && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onSendToGrade(d.code, d.name);
              }}
              className="gap-2 cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4 stroke-[2.5] text-blue-ink" />
              <span>Enviar para o Montar Grade</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Pinos de papel: handles minúsculos onde a caneta encosta no adesivo */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !min-w-0 !min-h-0 !bg-black !border-ink !rounded-full"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-1.5 !h-1.5 !min-w-0 !min-h-0 !bg-black !border-ink !rounded-full"
      />
    </div>
  );
});

// Aresta-caneta: traço ortogonal preto de 2px (3px na cadeia em hover), raio suave
const PenEdge = React.memo(function PenEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<PenFlowEdge>) {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  return (
    <BaseEdge
      path={path}
      strokeWidth={data?.inChain ? 3 : 2}
      interactionWidth={0}
      style={{
        stroke: "var(--color-ink-edge)",
        opacity: data?.dim ? 0.25 : 1,
        transition: "opacity 150ms ease-out",
      }}
    />
  );
});

const STATUS_HEX: Record<DisciplineStatus, string> = {
  completed: "#46e297",
  in_progress: "#2563eb",
  available: "#ffe600",
  locked: "var(--color-neutral-200)",
};

// Minimapa adesivo: miniatura do grafo desenhada à mão (retângulos por status
// sobre o papel), clicável para navegar — sem o minimapa da lib, que renderiza vazio
function FlowMinimap({
  layout,
}: {
  layout: {
    positions: Map<string, { x: number; y: number }>;
    discs: FlowchartDiscipline[];
  };
}) {
  const { zoom } = useViewport();
  const { setCenter } = useReactFlow();

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of layout.positions.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W);
      maxY = Math.max(maxY, p.y + NODE_H);
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [layout]);

  if (!bounds) return null;

  const PAD = 8;
  const W = 152;
  const H = 96;
  const scale = Math.min(W / bounds.w, H / bounds.h);

  const navigate = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const gx = bounds.minX + (e.clientX - rect.left - PAD) / scale;
    const gy = bounds.minY + (e.clientY - rect.top - PAD) / scale;
    setCenter(gx, gy, { zoom: Math.max(zoom, 0.4), duration: 200 });
  };

  return (
    <Panel position="bottom-right">
      <button
        type="button"
        onClick={navigate}
        aria-label="Minimapa: clique para navegar até uma região do mapa"
        title="Minimapa — clique para navegar"
        className="block cursor-pointer bg-paper border-2 border-ink rounded-xl shadow-neo-sm hover:translate-x-px hover:translate-y-px hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow] duration-150 ease-out"
        style={{ width: W + PAD * 2, height: H + PAD * 2 }}
      >
        <div className="relative w-full h-full">
          {layout.discs.map((d) => {
            const p = layout.positions.get(d.code);
            if (!p) return null;
            const bg = d.nature === "Optativa" ? "#c084fc" : STATUS_HEX[d.status as DisciplineStatus];
            return (
              <span
                key={d.code}
                aria-hidden
                style={{
                  position: "absolute",
                  left: (p.x - bounds.minX) * scale + PAD,
                  top: (p.y - bounds.minY) * scale + PAD,
                  width: Math.max(4, NODE_W * scale),
                  height: Math.max(2, NODE_H * scale),
                  background: bg,
                  border: "1px solid var(--color-ink-edge)",
                  borderRadius: 2,
                }}
              />
            );
          })}
        </div>
      </button>
    </Panel>
  );
}

const nodeTypes = { discipline: DisciplineNode };
const edgeTypes = { pen: PenEdge };

// Micro-ações adesivas do canvas: zoom e enquadrar
function CanvasControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const btn =
    "cursor-pointer h-7 w-7 flex items-center justify-center bg-paper text-black border-2 border-ink rounded-xl shadow-neo-sm hover:translate-x-px hover:translate-y-px hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow] duration-150 ease-out";

  return (
    <Panel position="top-right" className="flex items-center gap-1.5">
      <button
        type="button"
        className={btn}
        onClick={() => zoomOut({ duration: 150 })}
        aria-label="Diminuir zoom"
        title="Diminuir zoom"
      >
        <ZoomOut className="w-3.5 h-3.5 stroke-[2.5]" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => zoomIn({ duration: 150 })}
        aria-label="Aumentar zoom"
        title="Aumentar zoom"
      >
        <ZoomIn className="w-3.5 h-3.5 stroke-[2.5]" />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => fitView({ padding: 0.15, duration: 200 })}
        aria-label="Enquadrar mapa"
        title="Enquadrar mapa"
      >
        <Maximize className="w-3.5 h-3.5 stroke-[2.5]" />
      </button>
    </Panel>
  );
}

const FLOWCHART_VIEWPORT_CHECK_EVENT = "sarue:flowchart-check-viewport";

// Re-enquadra o grafo sempre que o layout muda (troca de matriz): sem isso a
// câmera ficava onde estava e o novo grafo nascia fora da tela
function AutoFit({
  trigger,
  containerRef,
}: {
  trigger: unknown;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { fitView, getNodesBounds } = useReactFlow();
  const store = useStoreApi();
  const [outOfView, setOutOfView] = useState(false);
  const outRef = useRef(false);

  const checkViewport = React.useCallback(() => {
    const { nodes, width, height, transform } = store.getState();
    const realNodes = nodes.filter((n) => !n.hidden);

    const el = containerRef.current;
    if (el && (!width || !height) && el.clientWidth > 0 && el.clientHeight > 0) {
      window.dispatchEvent(new Event("resize"));
      return;
    }

    if (realNodes.length === 0 || !width || !height) return;

    const [x, y, zoom] = transform;
    const broken = ![x, y, zoom].every(Number.isFinite) || zoom < 0.01;
    if (broken) {
      fitView({ padding: 0.15, duration: 0 });
      outRef.current = false;
      setOutOfView(false);
      return;
    }

    const viewL = -x / zoom;
    const viewT = -y / zoom;
    const viewR = viewL + width / zoom;
    const viewB = viewT + height / zoom;
    const b = getNodesBounds(realNodes);
    const ix = Math.min(viewR, b.x + b.width) - Math.max(viewL, b.x);
    const iy = Math.min(viewB, b.y + b.height) - Math.max(viewT, b.y);
    const inter = Math.max(0, ix) * Math.max(0, iy);
    const coverage = inter / ((width / zoom) * (height / zoom));
    const visible = coverage > 0.12;

    if (outRef.current !== !visible) {
      outRef.current = !visible;
      setOutOfView(!visible);
    }
  }, [store, fitView, containerRef, getNodesBounds]);

  useEffect(() => {
    const t = setTimeout(() => {
      fitView({ padding: 0.15, duration: 200 });
      outRef.current = false;
      setOutOfView(false);
    }, 60);
    return () => clearTimeout(t);
  }, [trigger, fitView]);

  // Verifica visibilidade sob demanda (após movimento/zoom ou redimensionamento do container)
  // em vez de polling contínuo por setInterval a cada 1.2s.
  useEffect(() => {
    const onMoveCheck = () => checkViewport();
    window.addEventListener(FLOWCHART_VIEWPORT_CHECK_EVENT, onMoveCheck);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => checkViewport());
      ro.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener(FLOWCHART_VIEWPORT_CHECK_EVENT, onMoveCheck);
      ro?.disconnect();
    };
  }, [checkViewport, containerRef]);

  if (!outOfView) return null;

  return (
    <Panel position="top-center">
      <button
        type="button"
        onClick={() => fitView({ padding: 0.15, duration: 200 })}
        className="cursor-pointer flex items-center gap-1.5 h-8 px-3 bg-neo-yellow text-ink border-2 border-ink rounded-xl shadow-neo-sm text-xs font-black hover:translate-x-px hover:translate-y-px hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 transition-[transform,box-shadow] duration-150 ease-out"
      >
        <Maximize className="w-3.5 h-3.5 stroke-[2.5]" />
        Mapa fora de vista — Reenquadrar
      </button>
    </Panel>
  );
}

// Se o canvas falhar, a seção inteira não morre: adesivo de erro com retry
class DiagramErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="h-[560px] w-full flex items-center justify-center p-8">
          <div className="bg-pastel-red border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo p-5 max-w-sm text-center">
            <p className="text-xs font-black text-black mb-1">
              Não foi possível desenhar o mapa
            </p>
            <p className="text-xs font-bold text-neutral-700 mb-3">
              Ocorreu um erro inesperado no diagrama. Seus dados estão intactos.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => this.setState({ failed: false })}
            >
              Tentar de novo
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Visão "Mapa": o fluxo do curso como grafo de pré-requisitos sobre papel quadriculado.
 * Nós = adesivos por status; arestas = traços de caneta; hover acende a cadeia ancestral.
 * Layout automático em camadas (dagre), pan/zoom no canvas (@xyflow/react).
 */
export const FlowchartDiagram: React.FC<FlowchartDiagramProps> = ({
  flowchartData,
  visibleCodes,
  onToggle,
  onSendToGrade,
}) => {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Layout por componente conexo: cada cadeia real vira uma faixa horizontal
  // (LR) e disciplinas sem nenhuma dependência formam uma grade compacta abaixo.
  const layout = useMemo(() => {
    const discs: FlowchartDiscipline[] = [];
    const seenCodes = new Set<string>();
    for (const sem of flowchartData.semesters) {
      for (const d of sem.disciplines) {
        // Código duplicado na matriz não pode derrubar o grafo: mantém o primeiro
        if (seenCodes.has(d.code)) continue;
        seenCodes.add(d.code);
        discs.push(d);
      }
    }
    const codes = seenCodes;

    const edgePairs: Array<{ source: string; target: string }> = [];
    const seenPairs = new Set<string>();
    for (const d of discs) {
      for (const p of d.prerequisites) {
        // Pré-requisito fora das obrigatórias (optativa usada como requisito) não vira nó na v1
        if (!codes.has(p)) continue;
        const key = `${p}->${d.code}`;
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        edgePairs.push({ source: p, target: d.code });
      }
    }

    // Union-find de componentes conexos
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let root = x;
      while (parent.get(root) !== root) root = parent.get(root)!;
      return root;
    };
    for (const d of discs) parent.set(d.code, d.code);
    for (const e of edgePairs) {
      const a = find(e.source);
      const b = find(e.target);
      if (a !== b) parent.set(a, b);
    }

    const byRoot = new Map<string, FlowchartDiscipline[]>();
    for (const d of discs) {
      const r = find(d.code);
      if (!byRoot.has(r)) byRoot.set(r, []);
      byRoot.get(r)!.push(d);
    }

    const layoutBand = (band: FlowchartDiscipline[]) => {
      const g = new dagre.graphlib.Graph();
      g.setGraph({ rankdir: "LR", nodesep: 24, ranksep: 80, marginx: 0, marginy: 0 });
      g.setDefaultEdgeLabel(() => ({}));
      const bandCodes = new Set(band.map((d) => d.code));
      for (const d of band) g.setNode(d.code, { width: NODE_W, height: NODE_H });
      for (const e of edgePairs) {
        if (bandCodes.has(e.source) && bandCodes.has(e.target)) {
          g.setEdge(e.source, e.target);
        }
      }
      dagre.layout(g);
      return g;
    };

    const multi = Array.from(byRoot.values())
      .filter((b) => b.length > 1)
      .sort((a, b) => b.length - a.length);
    const singles = Array.from(byRoot.values())
      .filter((b) => b.length === 1)
      .flat();

    const positions = new Map<string, { x: number; y: number }>();
    let xCursor = 0;
    let bandsBottom = 0;

    for (const band of multi) {
      const g = layoutBand(band);
      let bandBottom = 0;
      let bandRight = 0;
      for (const d of band) {
        const n = g.node(d.code);
        positions.set(d.code, {
          x: n.x - NODE_W / 2 + xCursor,
          y: n.y - NODE_H / 2,
        });
        bandBottom = Math.max(bandBottom, n.y + NODE_H / 2);
        bandRight = Math.max(bandRight, n.x + NODE_W / 2);
      }
      xCursor += bandRight + 72;
      bandsBottom = Math.max(bandsBottom, bandBottom);
    }
    const bandsWidth = Math.max(xCursor, 5 * (NODE_W + 24));

    // Grade compacta de isoladas (nenhuma aresta as conecta), na largura das faixas
    const colW = NODE_W + 24;
    const perRow = Math.max(5, Math.floor(bandsWidth / colW));
    for (let i = 0; i < singles.length; i++) {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      positions.set(singles[i].code, {
        x: col * colW,
        y: bandsBottom + 64 + row * (NODE_H + 24),
      });
    }

    const prereqMap = new Map<string, Set<string>>();
    for (const e of edgePairs) {
      if (!prereqMap.has(e.target)) prereqMap.set(e.target, new Set());
      prereqMap.get(e.target)!.add(e.source);
    }

    return { discs, positions, edgePairs, prereqMap };
  }, [flowchartData]);

  // Cadeia ancestral do nó em hover: todos os pré-requisitos recursivos
  const chain = useMemo(() => {
    if (!hoveredCode) return null;
    const set = new Set([hoveredCode]);
    const stack = [hoveredCode];
    while (stack.length > 0) {
      const code = stack.pop()!;
      for (const p of layout.prereqMap.get(code) || []) {
        if (!set.has(p)) {
          set.add(p);
          stack.push(p);
        }
      }
    }
    return set;
  }, [hoveredCode, layout]);

  // Cache de nós completos por (código, status, dim, cadeia, x, y):
  // mantém a mesma referência de nó para nós inalterados, evitando que o
  // adoptUserNodes do @xyflow/react resete medição interna e handles.
  const nodeCache = useRef(new Map<string, DisciplineFlowNode>());

  const nodes = useMemo<DisciplineFlowNode[]>(
    () =>
      layout.discs.map((d) => {
        // Hover vence o esmaecimento de filtro: a cadeia acende inteira
        const dim = chain ? !chain.has(d.code) : !visibleCodes.has(d.code);
        const inChain = !!chain?.has(d.code);
        const pos = layout.positions.get(d.code) ?? { x: 0, y: 0 };
        const key = `${d.code}|${d.status}|${dim}|${inChain}|${pos.x},${pos.y}`;
        let node = nodeCache.current.get(key);
        if (
          !node ||
          node.data.onToggle !== onToggle ||
          node.data.onSendToGrade !== onSendToGrade ||
          node.data.discipline !== d
        ) {
          node = {
            id: d.code,
            type: "discipline" as const,
            position: pos,
            width: NODE_W,
            height: NODE_H,
            initialWidth: NODE_W,
            initialHeight: NODE_H,
            measured: { width: NODE_W, height: NODE_H },
            style: { width: NODE_W, height: NODE_H, visibility: "visible" },
            data: { discipline: d, dim, inChain, onToggle, onSendToGrade },
            draggable: false,
          };
          nodeCache.current.set(key, node);
        }
        return node;
      }),
    [layout, chain, visibleCodes, onToggle, onSendToGrade],
  );

  const edgeCache = useRef(new Map<string, PenFlowEdge>());

  const edges = useMemo<PenFlowEdge[]>(
    () =>
      layout.edgePairs.map(({ source, target }) => {
        const dim = chain
          ? !(chain.has(source) && chain.has(target))
          : !visibleCodes.has(source) || !visibleCodes.has(target);
        const inChain = !!chain?.has(source) && !!chain?.has(target);
        const key = `${source}->${target}|${dim}|${inChain}`;
        let edge = edgeCache.current.get(key);
        if (!edge) {
          edge = {
            id: `${source}->${target}`,
            source,
            target,
            type: "pen" as const,
            data: { dim, inChain },
          };
          edgeCache.current.set(key, edge);
        }
        return edge;
      }),
    [layout, chain, visibleCodes],
  );

  if (nodes.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-xs font-bold text-neutral-600">
          Nenhuma disciplina obrigatória nesta matriz curricular.
        </p>
      </div>
    );
  }

  return (
    <DiagramErrorBoundary key={flowchartData.curriculum?.id ?? "map"}>
      <div
        ref={canvasRef}
        className="relative h-[560px] w-full bg-canvas"
        data-testid="flowchart-diagram"
      >
        <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          edgesFocusable={false}
          zoomOnDoubleClick={false}
          minZoom={0.1}
          maxZoom={1.6}
          onlyRenderVisibleElements={true}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.1 }}
          deleteKeyCode={null}
          onMoveEnd={() => window.dispatchEvent(new Event(FLOWCHART_VIEWPORT_CHECK_EVENT))}
          onNodeMouseEnter={
            SUPPORTS_HOVER ? (_, node) => setHoveredCode(node.id) : undefined
          }
          onNodeMouseLeave={
            SUPPORTS_HOVER ? () => setHoveredCode(null) : undefined
          }
          className="w-full h-full"
        >
          {/* Papel quadriculado: grid de 32px que escala com o zoom */}
          <Background
            variant={BackgroundVariant.Lines}
            gap={32}
            lineWidth={1}
            color="var(--grid-line)"
          />
          <CanvasControls />
          <AutoFit trigger={layout} containerRef={canvasRef} />
          <FlowMinimap layout={layout} />
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </DiagramErrorBoundary>
  );
};
