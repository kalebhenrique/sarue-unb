import React, { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Save,
  Search,
  ChevronDown,
  MoreVertical,
} from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import {
  PageContainer,
  PageHeader,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FloatingActionButton,
  HeaderIconButton,
  Input,
  Card,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  EmptyState,
  toast,
} from "@/components/ui";
import { useMyCourse } from "@/hooks/useMyCourse";
import { getActiveGradePeriod } from "@/hooks/useGrade";
import { useContainer } from "@/context/ContainerContext";
import type { CurriculumDiscipline, CurriculumStructure } from "@/core";

type Nature = CurriculumDiscipline["nature"];
type ListKey =
  | "mandatoryDisciplines"
  | "electiveDisciplines"
  | "complementaryDisciplines";
type CatalogItem = {
  code: string;
  name: string;
  hours?: number;
  prerequisites?: string[];
  prerequisitesRaw?: string;
  equivalences?: string[];
};
type CatalogStatus = "loading" | "ready" | "error";

const NATURES: Nature[] = ["Obrigatória", "Optativa", "Complementar"];

const LIST_KEY: Record<Nature, ListKey> = {
  Obrigatória: "mandatoryDisciplines",
  Optativa: "electiveDisciplines",
  Complementar: "complementaryDisciplines",
};

const NATURE_LABEL: Record<Nature, string> = {
  Obrigatória: "Obrigatória",
  Optativa: "Optativa de Interesse",
  Complementar: "Complementar",
};

const SEMESTER_ITEMS = Array.from({ length: 18 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}º Semestre`,
}));

const NATURE_ITEMS = NATURES.map((n) => ({ value: n, label: NATURE_LABEL[n] }));

interface DisciplineFormState {
  code: string;
  name: string;
  hours: string;
  level: string;
  nature: Nature;
  prerequisites: string;
}

const EMPTY_FORM: DisciplineFormState = {
  code: "",
  name: "",
  hours: "60",
  level: "1",
  nature: "Obrigatória",
  prerequisites: "",
};

const normalizeCode = (s: string) => s.toUpperCase().trim();

// Busca sem sensibilidade a acentos, maiúsculas ou pontuação
const normalizeText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .trim();

const parsePrerequisites = (input: string): string[] => {
  if (!input) return [];
  const matches = input.match(/[A-Z]{3,4}\d{4}/gi);
  if (matches) {
    return Array.from(new Set(matches.map((c) => c.toUpperCase())));
  }
  return input
    .split(/[,;\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
};

const toFormState = (disc: CurriculumDiscipline): DisciplineFormState => ({
  code: disc.code,
  name: disc.name,
  hours: String(disc.workloadHours ?? 60),
  level: String(disc.level ?? 1),
  nature: disc.nature,
  prerequisites:
    disc.prerequisitesRaw ||
    (disc.prerequisites && disc.prerequisites.length > 0
      ? disc.prerequisites.join(", ")
      : ""),
});

const toDiscipline = (form: DisciplineFormState): CurriculumDiscipline => {
  const prereqs = parsePrerequisites(form.prerequisites);
  return {
    code: normalizeCode(form.code),
    name: form.name.trim(),
    workloadHours: parseInt(form.hours, 10) || 60,
    level: parseInt(form.level, 10) || 0,
    nature: form.nature,
    prerequisites: prereqs,
    prerequisitesRaw: form.prerequisites.trim() || undefined,
    equivalences: [],
  };
};

const FieldLabel: React.FC<{ children: React.ReactNode; htmlFor?: string }> = ({
  children,
  htmlFor,
}) => (
  <label
    htmlFor={htmlFor}
    className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block mb-1"
  >
    {children}
  </label>
);

const SemesterSelect: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ id, value, onChange }) => (
  <Select
    value={value}
    items={SEMESTER_ITEMS}
    onValueChange={(next) => {
      if (!next) return;
      onChange(next);
    }}
  >
    <SelectTrigger id={id} className="w-full min-w-0 box-border">
      <SelectValue>
        {SEMESTER_ITEMS.find((item) => item.value === value)?.label ??
          SEMESTER_ITEMS[0].label}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {SEMESTER_ITEMS.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const NatureSelect: React.FC<{
  id?: string;
  value: Nature;
  onChange: (value: Nature) => void;
}> = ({ id, value, onChange }) => (
  <Select
    value={value}
    items={NATURE_ITEMS}
    onValueChange={(next) => {
      if (!next) return;
      onChange(next as Nature);
    }}
  >
    <SelectTrigger id={id} className="w-full min-w-0 box-border">
      <SelectValue>{NATURE_LABEL[value]}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      {NATURE_ITEMS.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Preenchimento rápido pelo catálogo da UnB: gatilho estilo Select e popup
 * com busca interna navegável por teclado (mesmo desenho do DepartmentSelect
 * da Grade). Escolher um item devolve code/name/hours ao formulário.
 */
const CatalogDisciplineSelect: React.FC<{
  items: CatalogItem[];
  status: CatalogStatus;
  value: string | null;
  onPick: (item: CatalogItem) => void;
}> = ({ items, status, value, onPick }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    const base = q
      ? items.filter(
          (d) =>
            normalizeText(d.code).includes(q) ||
            normalizeText(d.name).includes(q),
        )
      : items;
    return base.slice(0, 50);
  }, [items, query]);

  const pick = (item: CatalogItem) => {
    onPick(item);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger
        disabled={status !== "ready"}
        className="flex h-10 w-full min-w-0 box-border items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-black focus:outline-hidden focus:ring-2 focus:ring-neo-blue transition-[box-shadow,border-color] cursor-pointer select-none rounded-xl border-2 border-ink bg-paper disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="truncate text-left">
          {value ??
            (status === "loading"
              ? "Carregando catálogo da UnB…"
              : status === "error"
                ? "Catálogo indisponível — preencha manualmente"
                : "Buscar pelo código ou nome (ex.: APC, Cálculo 1)…")}
        </span>
        <ChevronDown
          className={`w-4 h-4 stroke-[2.5] shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="isolate z-50"
        >
          <Popover.Popup className="relative z-50 w-[min(320px,calc(100vw-2rem))] sm:w-max sm:min-w-[320px] max-w-[calc(100vw-2rem)] sm:max-w-[480px] rounded-lg border-2 border-ink bg-canvas text-black outline-hidden origin-(--transform-origin)">
            {/* Busca interna */}
            <div className="p-2 border-b-2 border-ink/10">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-neutral-500 stroke-[2.5]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveIndex((i) => Math.max(i - 1, 0));
                    } else if (e.key === "Home" && filtered.length > 0) {
                      e.preventDefault();
                      setActiveIndex(0);
                    } else if (e.key === "End" && filtered.length > 0) {
                      e.preventDefault();
                      setActiveIndex(filtered.length - 1);
                    } else if (e.key === "Enter" && filtered[activeIndex]) {
                      e.preventDefault();
                      pick(filtered[activeIndex]);
                    }
                  }}
                  role="combobox"
                  aria-expanded={open}
                  aria-controls={open ? "catalog-listbox" : undefined}
                  aria-activedescendant={
                    open
                      ? `catalog-option-${filtered[activeIndex]?.code}`
                      : undefined
                  }
                  autoFocus
                  placeholder="Pesquisar disciplina…"
                  className="w-full h-8 bg-paper pl-9 pr-3 text-xs font-semibold text-black rounded-lg border-2 border-ink focus:outline-hidden focus:ring-2 focus:ring-neo-blue placeholder:text-neutral-600"
                />
              </div>
            </div>

            {/* Lista filtrável (listbox navegável por setas) */}
            <div
              id="catalog-listbox"
              role="listbox"
              className="p-1 max-h-64 overflow-y-auto"
            >
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-xs font-semibold text-neutral-600">
                  Nada encontrado no catálogo
                </p>
              ) : (
                filtered.map((item, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={item.code}
                      id={`catalog-option-${item.code}`}
                      ref={(el) => {
                        if (el && isActive) {
                          el.scrollIntoView({ block: "nearest" });
                        }
                      }}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onClick={() => pick(item)}
                      onMouseMove={() => setActiveIndex(index)}
                      data-active={isActive}
                      className="relative flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-lg py-1.5 pr-2.5 pl-2.5 text-xs font-bold focus:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-inset hover:bg-neo-blue hover:text-white data-[active=true]:bg-neo-blue data-[active=true]:text-white transition-colors"
                    >
                      <span className="truncate text-left">
                        <span className="font-mono font-black">{item.code}</span>{" "}
                        — {item.name}
                      </span>
                      {item.hours ? (
                        <span className="text-[11px] font-bold shrink-0">
                          {item.hours}h
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

export interface CurriculumEditorScreenProps {
  onBack: () => void;
}

export const CurriculumEditorScreen: React.FC<CurriculumEditorScreenProps> = ({
  onBack,
}) => {
  const {
    curriculum,
    originalCurriculum,
    hasCustomCurriculum,
    allCurricula,
    saveCustomCurriculum,
    resetCustomCurriculum,
  } = useMyCourse();

  const { useCases } = useContainer();

  // Cópia local de trabalho da matriz (as três listas do domínio)
  const [draft, setDraft] = useState<CurriculumStructure | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (curriculum) {
      setDraft(JSON.parse(JSON.stringify(curriculum)));
    }
  }, [curriculum]);

  // Catálogo geral de disciplinas para o preenchimento rápido
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<CatalogStatus>("loading");

  useEffect(() => {
    let isMounted = true;
    setCatalogStatus("loading");
    (async () => {
      try {
        const { year: catalogYear, period: catalogPeriod } =
          getActiveGradePeriod();
        const classes = await useCases.scrapeClasses.execute(
          "ALL",
          catalogYear,
          catalogPeriod,
        );
        if (!isMounted) return;
        const list: CatalogItem[] = [];
        const byCode = new Map<string, CatalogItem>();

        for (const d of classes) {
          if (!byCode.has(d.code)) {
            const item = { code: d.code, name: d.name };
            byCode.set(d.code, item);
            list.push(item);
          }
        }

        // Disciplinas das matrizes carregadas complementam o catálogo com pré-requisitos.
        // Lookup por Map: allCurricula traz TODAS as matrizes da UnB (600+), e um
        // find() O(n) dentro deste loop travava a main thread por minutos.
        for (const curr of allCurricula) {
          for (const d of [
            ...(curr.mandatoryDisciplines || []),
            ...(curr.electiveDisciplines || []),
            ...(curr.complementaryDisciplines || []),
          ]) {
            const existing = byCode.get(d.code);
            if (!existing) {
              const item = {
                code: d.code,
                name: d.name,
                hours: d.workloadHours,
                prerequisites: d.prerequisites,
                prerequisitesRaw: d.prerequisitesRaw,
                equivalences: d.equivalences,
              };
              byCode.set(d.code, item);
              list.push(item);
            } else if ((!existing.prerequisites || existing.prerequisites.length === 0) && d.prerequisites?.length) {
              existing.prerequisites = d.prerequisites;
              existing.prerequisitesRaw = d.prerequisitesRaw;
              existing.equivalences = d.equivalences;
              if (!existing.hours) existing.hours = d.workloadHours;
            }
          }
        }

        if (!isMounted) return;
        setCatalog(list);
        setCatalogStatus("ready");
      } catch (e) {
        if (!isMounted) return;
        setCatalogStatus("error");
        console.warn("Erro ao carregar catálogo para busca:", e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [useCases, allCurricula]);

  // Formulário único: adicionar e editar compartilham o mesmo estado
  const [form, setForm] = useState<DisciplineFormState>(EMPTY_FORM);
  // Ao editar, guarda a disciplina original
  const [editingSource, setEditingSource] = useState<CurriculumDiscipline | null>(
    null,
  );
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);

  // Confirmações: sair sem salvar, restaurar oficial, remover disciplina
  type ConfirmState =
    | { kind: "back" }
    | { kind: "reset" }
    | { kind: "remove"; code: string; name: string; nature: Nature };
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const setFormFields = (patch: Partial<DisciplineFormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingSource(null);
    setPickedLabel(null);
    setIsFormOpen(true);
  };

  const openEdit = (disc: CurriculumDiscipline) => {
    setForm(toFormState(disc));
    setEditingSource(disc);
    setPickedLabel(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingSource(null);
    setForm(EMPTY_FORM);
    setPickedLabel(null);
  };

  const handlePickSuggestion = (item: CatalogItem) => {
    const prereqStr =
      item.prerequisitesRaw ||
      (item.prerequisites && item.prerequisites.length > 0
        ? item.prerequisites.join(", ")
        : "");
    setFormFields({
      code: item.code,
      name: item.name,
      ...(item.hours ? { hours: String(item.hours) } : {}),
      prerequisites: prereqStr,
    });
    setPickedLabel(`${item.code} — ${item.name}`);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;

    const code = normalizeCode(form.code);
    const name = form.name.trim();
    if (!code || !name) {
      toast.add({
        title: "Campos obrigatórios",
        description: "Preencha o código e o nome da disciplina.",
        type: "warning",
      });
      return;
    }

    const disc = toDiscipline(form);
    if (editingSource) {
      disc.equivalences = editingSource.equivalences || [];
      if (!form.prerequisites.trim() && editingSource.prerequisites?.length) {
        disc.prerequisites = editingSource.prerequisites;
        disc.prerequisitesRaw = editingSource.prerequisitesRaw;
      }
    }

    const key = LIST_KEY[form.nature];

    if (editingSource) {
      const oldKey = LIST_KEY[editingSource.nature];
      if (oldKey === key) {
        const list = [...draft[key]];
        const idx = list.findIndex((d) => d.code === editingSource.code);
        if (idx >= 0) list[idx] = disc;
        else list.push(disc);
        setDraft({ ...draft, [key]: list } as CurriculumStructure);
      } else {
        // Mudou de natureza: sai de uma lista e entra na outra
        setDraft({
          ...draft,
          [oldKey]: (draft[oldKey] || []).filter(
            (d) => d.code !== editingSource.code,
          ),
          [key]: [...(draft[key] || []), disc],
        } as CurriculumStructure);
      }
      toast.add({
        title: "Disciplina atualizada",
        description: `${code} foi atualizada no rascunho.`,
        type: "info",
        timeout: 2000,
      });
    } else {
      // Upsert: se o código já existe em qualquer lista da matriz (ex.:
      // optativa do catálogo oficial, que chega sem semestre), a entrada sai
      // de lá e volta com o semestre e a natureza escolhidos
      const lists: Record<ListKey, CurriculumDiscipline[]> = {
        mandatoryDisciplines: [...(draft.mandatoryDisciplines || [])],
        electiveDisciplines: [...(draft.electiveDisciplines || [])],
        complementaryDisciplines: [...(draft.complementaryDisciplines || [])],
      };
      let replaced = false;
      for (const listKey of Object.keys(lists) as ListKey[]) {
        const before = lists[listKey].length;
        lists[listKey] = lists[listKey].filter((d) => d.code !== code);
        if (lists[listKey].length < before) replaced = true;
      }
      lists[key].push(disc);
      setDraft({ ...draft, ...lists } as CurriculumStructure);
      toast.add(
        replaced
          ? {
              title: "Disciplina atualizada",
              description: `${code} já estava na matriz e recebeu o semestre e a natureza escolhidos.`,
              type: "info",
              timeout: 2500,
            }
          : {
              title: "Disciplina adicionada",
              description: `${code} foi inserida em ${NATURE_LABEL[form.nature]}.`,
              type: "success",
              timeout: 2500,
            },
      );
    }

    setHasChanges(true);
    closeForm();
  };

  const applyRemove = (code: string, nature: Nature) => {
    if (!draft) return;
    const key = LIST_KEY[nature];
    setDraft({
      ...draft,
      [key]: (draft[key] || []).filter((d) => d.code !== code),
    } as CurriculumStructure);
    setHasChanges(true);
    toast.add({
      title: "Disciplina removida",
      description: `${code} saiu do rascunho do currículo.`,
      type: "info",
      timeout: 2500,
    });
  };

  const handleSaveAll = async () => {
    if (!draft) return;
    setIsSaving(true);
    try {
      await saveCustomCurriculum(draft);
      setHasChanges(false);
      toast.add({
        title: "Currículo salvo",
        description: "A matriz personalizada já está em vigor.",
        type: "success",
        timeout: 2500,
      });
    } catch (e) {
      console.warn("Erro ao salvar currículo:", e);
      toast.add({
        title: "Não foi possível salvar",
        description:
          "Suas edições continuam no rascunho — tente salvar de novo.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const applyReset = async () => {
    setIsSaving(true);
    try {
      await resetCustomCurriculum();
      if (originalCurriculum) {
        setDraft(JSON.parse(JSON.stringify(originalCurriculum)));
      }
      setHasChanges(false);
    } catch (e) {
      console.warn("Erro ao restaurar a matriz oficial:", e);
      toast.add({
        title: "Não foi possível restaurar",
        description:
          "O currículo personalizado continua em vigor — tente de novo.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const requestBack = () => {
    if (hasChanges) setConfirm({ kind: "back" });
    else onBack();
  };

  // Agrupa por semestre: obrigatórias, optativas e complementares
  const groups = useMemo(() => {
    if (!draft) return [];
    const map = new Map<
      number,
      Array<{ disc: CurriculumDiscipline; nature: Nature }>
    >();

    for (const nature of NATURES) {
      for (const disc of draft[LIST_KEY[nature]] || []) {
        // Apenas disciplinas com semestre de 1 a 18 são exibidas na grade por semestre
        const level =
          disc.level && disc.level > 0
            ? disc.level
            : nature === "Obrigatória"
            ? 1
            : 0;
        if (level === 0) continue;
        if (!map.has(level)) map.set(level, []);
        map.get(level)!.push({ disc, nature });
      }
    }

    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([level, rows]) => ({
        level,
        rows: [...rows].sort((a, b) => a.disc.code.localeCompare(b.disc.code)),
        totalHours: rows.reduce(
          (acc, r) => acc + (r.disc.workloadHours || 60),
          0,
        ),
      }));
  }, [draft]);

  const totalCount = groups.reduce((acc, g) => acc + g.rows.length, 0);

  const isConfirmOpen = confirm !== null;

  return (
    <PageContainer>
      <PageHeader
        title="Gerenciar Currículo"
        icon={BookOpen}
        count={totalCount}
        onBack={requestBack}
        backLabel="Voltar para Meu Curso"
        mobileActions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <HeaderIconButton
                  aria-label="Ações do currículo"
                  hasActiveIndicator={hasChanges}
                >
                  <MoreVertical className="w-4 h-4 stroke-[2.5]" />
                </HeaderIconButton>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={!hasChanges || isSaving}
                onClick={handleSaveAll}
              >
                <Save className="w-4 h-4 stroke-[2.5]" />
                {isSaving ? "Salvando..." : "Salvar Currículo"}
              </DropdownMenuItem>
              {hasCustomCurriculum ? (
                <DropdownMenuItem
                  disabled={isSaving}
                  onClick={() => setConfirm({ kind: "reset" })}
                >
                  <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                  Restaurar Oficial
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={requestBack}>
              <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Voltar</span>
            </Button>

            {hasCustomCurriculum && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirm({ kind: "reset" })}
                disabled={isSaving}
                title="Apagar o currículo personalizado e voltar à matriz oficial da UnB"
              >
                <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Restaurar Oficial</span>
              </Button>
            )}

            <Button variant="accent" size="sm" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Adicionar Disciplina</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveAll}
              disabled={!hasChanges || isSaving}
              isLoading={isSaving}
            >
              <Save className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Salvar Currículo</span>
            </Button>
          </div>
        }
      />

      {/* Linha de contexto: curso, situação e estado do rascunho */}
      <div className="bg-pastel-blue border-2 border-ink rounded-lg px-4 py-2.5 shadow-neo-sm md:shadow-neo flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm font-black text-black">
          {draft?.courseName}
        </span>
        <span className="font-mono text-xs font-bold text-neutral-700">
          {draft?.code}
        </span>
        {hasCustomCurriculum && (
          <Badge variant="purple" size="sm">
            Currículo Personalizado
          </Badge>
        )}
        <span className="hidden lg:inline text-[11px] font-bold text-neutral-700">
          Edite disciplinas, ajuste cargas e semestres.
        </span>
        {hasChanges && (
          <Badge variant="yellow" size="md" className="ml-auto shrink-0">
            Alterações não salvas
          </Badge>
        )}
      </div>

      {/* Matriz vazia */}
      {totalCount === 0 && (
        <EmptyState
          title="Matriz vazia"
          description="Nenhuma disciplina no rascunho deste currículo. Comece adicionando as matérias do seu curso — pode puxar do catálogo da UnB pelo código ou nome."
          action={
            <Button variant="accent" onClick={openAdd}>
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Adicionar Disciplina</span>
            </Button>
          }
        />
      )}

      {/* Grade por semestre */}
      {totalCount > 0 &&
        groups.map(({ level, rows, totalHours }) => (
          <Card
            key={`semester-${level}`}
            className="p-0 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-100 border-b-2 border-ink">
              <div className="flex items-center gap-2">
                <span className="font-black text-xs uppercase tracking-wider text-black">
                  {level}º Semestre
                </span>
                <Badge variant="neutral" size="sm">
                  {rows.length}{" "}
                  {rows.length === 1 ? "disciplina" : "disciplinas"}
                </Badge>
              </div>
              <span className="text-[11px] font-bold text-neutral-600">
                {totalHours}h
              </span>
            </div>

            <div className="divide-y divide-black/10">
              {rows.map(({ disc, nature }) => (
                <div
                  key={disc.code}
                  className="flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-neutral-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-xs font-black text-black"
                        title={`${disc.code} - ${disc.name}`}
                      >
                        {disc.code} - {disc.name}
                      </span>
                      {nature !== "Obrigatória" && (
                        <Badge
                          variant={nature === "Optativa" ? "purple" : "yellow"}
                          size="sm"
                        >
                          {NATURE_LABEL[nature]}
                        </Badge>
                      )}
                      <span className="text-[11px] font-bold text-neutral-500">
                        {disc.workloadHours}h
                      </span>
                    </div>

                    {(disc.prerequisites?.length ?? 0) > 0 && (
                      <p className="text-[11px] font-bold text-neutral-600 mt-0.5">
                        Pré-requisitos:{" "}
                        <span className="font-mono">
                          {disc.prerequisites.join(", ")}
                        </span>
                      </p>
                    )}

                    {(disc.equivalences?.length ?? 0) > 0 && (
                      <p className="text-[11px] font-bold text-neutral-500 mt-0.5">
                        Equivalências:{" "}
                        <span className="font-mono">
                          {disc.equivalences.join(", ")}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEdit(disc)}
                      title="Editar disciplina"
                      aria-label="Editar disciplina"
                      className="w-8 h-8"
                    >
                      <Pencil className="w-3.5 h-3.5 stroke-[2.5]" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setConfirm({
                          kind: "remove",
                          code: disc.code,
                          name: disc.name,
                          nature,
                        })
                      }
                      title="Remover disciplina"
                      aria-label="Remover disciplina"
                      className="w-8 h-8 text-neo-danger hover:bg-pastel-red"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}

      {/* Diálogo: Adicionar / Editar Disciplina */}
      {isFormOpen && (
        <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeForm()}>
          <DialogContent
            showCloseButton={true}
            className="sm:max-w-lg min-w-0 box-border overflow-x-hidden"
          >
            <DialogHeader className="w-full min-w-0 box-border">
              <DialogTitle>
                {editingSource ? "Editar Disciplina" : "Adicionar Disciplina"}
              </DialogTitle>
              <DialogDescription>
                {editingSource
                  ? "Altere os dados da disciplina ou troque por uma matéria equivalente buscando no catálogo."
                  : "Busque no catálogo da UnB pelo código ou nome, ou preencha manualmente."}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={handleSaveForm}
              className="w-full min-w-0 box-border space-y-3 py-2"
            >
              {/* Preenchimento rápido: bloco separado do formulário */}
              <div className="w-full min-w-0 box-border pb-4 mb-1 border-b-2 border-ink/10">
                <FieldLabel>Preenchimento rápido — Catálogo da UnB</FieldLabel>
                <CatalogDisciplineSelect
                  items={catalog}
                  status={catalogStatus}
                  value={pickedLabel}
                  onPick={handlePickSuggestion}
                />
                {catalogStatus === "loading" && (
                  <p className="mt-1.5 text-[11px] font-bold text-neutral-600">
                    Buscando as disciplinas no SIGAA…
                  </p>
                )}
                {catalogStatus === "error" && (
                  <p className="mt-1.5 text-[11px] font-bold text-ink-error">
                    Catálogo indisponível agora — preencha os campos
                    manualmente.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 w-full min-w-0 box-border">
                <div className="w-full min-w-0 box-border">
                  <FieldLabel htmlFor="disc-code">Código *</FieldLabel>
                  <Input
                    id="disc-code"
                    value={form.code}
                    onChange={(e) => setFormFields({ code: e.target.value })}
                    placeholder="Ex: CIC0004"
                    className="w-full min-w-0 box-border h-9 text-xs font-mono font-bold uppercase"
                    required
                  />
                </div>

                <div className="w-full min-w-0 box-border">
                  <FieldLabel htmlFor="disc-hours">Carga Horária</FieldLabel>
                  <Input
                    id="disc-hours"
                    type="number"
                    value={form.hours}
                    onChange={(e) => setFormFields({ hours: e.target.value })}
                    placeholder="60"
                    className="w-full min-w-0 box-border h-9 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="w-full min-w-0 box-border">
                <FieldLabel htmlFor="disc-name">
                  Nome da Disciplina *
                </FieldLabel>
                <Input
                  id="disc-name"
                  value={form.name}
                  onChange={(e) => setFormFields({ name: e.target.value })}
                  placeholder="Nome completo da disciplina"
                  className="w-full min-w-0 box-border h-9 text-xs font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 w-full min-w-0 box-border">
                <div className="w-full min-w-0 box-border">
                  <FieldLabel htmlFor="disc-level">Semestre</FieldLabel>
                  <SemesterSelect
                    id="disc-level"
                    value={form.level}
                    onChange={(level) => setFormFields({ level })}
                  />
                </div>

                <div className="w-full min-w-0 box-border">
                  <FieldLabel htmlFor="disc-nature">Natureza</FieldLabel>
                  <NatureSelect
                    id="disc-nature"
                    value={form.nature}
                    onChange={(nature) => setFormFields({ nature })}
                  />
                </div>
              </div>

              <div className="w-full min-w-0 box-border">
                <FieldLabel htmlFor="disc-prereqs">
                  Pré-requisitos (opcional)
                </FieldLabel>
                <Input
                  id="disc-prereqs"
                  value={form.prerequisites}
                  onChange={(e) =>
                    setFormFields({ prerequisites: e.target.value })
                  }
                  placeholder="Ex: CIC0004, MAT0025 ou CIC0004 E MAT0025"
                  className="w-full min-w-0 box-border h-9 text-xs font-mono font-bold uppercase"
                />
                <p className="mt-1 text-[11px] font-semibold text-neutral-500">
                  Ao escolher do catálogo, os pré-requisitos oficiais são preenchidos automaticamente.
                </p>
              </div>

              <DialogFooter className="grid grid-cols-2 gap-2 pt-1 w-full min-w-0 box-border sm:flex sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  size="md"
                  type="button"
                  onClick={closeForm}
                  className="w-full sm:w-auto"
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  type="submit"
                  className="w-full sm:w-auto"
                >
                  {editingSource ? "Confirmar" : "Adicionar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Diálogo: confirmações destrutivas */}
      {isConfirmOpen && confirm && (
        <Dialog
          open={isConfirmOpen}
          onOpenChange={(open) => !open && setConfirm(null)}
        >
          <DialogContent showCloseButton={true} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {confirm.kind === "remove"
                  ? `Remover ${confirm.code}?`
                  : confirm.kind === "reset"
                    ? "Restaurar matriz oficial?"
                    : "Descartar alterações?"}
              </DialogTitle>
              <DialogDescription>
                {confirm.kind === "remove"
                  ? `“${confirm.name}” sai do rascunho do currículo. O restante continua intacto até você salvar.`
                  : confirm.kind === "reset"
                    ? "O currículo personalizado será apagado e a matriz oficial da UnB volta a valer. Essa ação não pode ser desfeita."
                    : "A matriz tem alterações não salvas. Se sair agora, você perde o que foi editado neste rascunho."}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button
                variant="outline"
                size="md"
                onClick={() => setConfirm(null)}
              >
                {confirm.kind === "back" ? "Continuar editando" : "Cancelar"}
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={() => {
                  const current = confirm;
                  setConfirm(null);
                  if (current.kind === "back") onBack();
                  else if (current.kind === "reset") applyReset();
                  else applyRemove(current.code, current.nature);
                }}
              >
                {confirm.kind === "remove"
                  ? "Remover"
                  : confirm.kind === "reset"
                    ? "Restaurar"
                    : "Descartar e sair"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <FloatingActionButton
        variant="accent"
        icon={Plus}
        aria-label="Adicionar Disciplina"
        title="Adicionar Disciplina"
        onClick={openAdd}
        className="md:hidden"
      />
    </PageContainer>
  );
};
