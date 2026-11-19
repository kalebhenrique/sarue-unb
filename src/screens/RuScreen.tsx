import React, { useState, useEffect, useMemo } from 'react';
import {
  Utensils,
  Coffee,
  Soup,
  Salad,
  Croissant,
  Apple,
  CupSoda,
  Calendar,
  MapPin,
  Leaf,
  Egg,
  Drumstick,
  Sparkles,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  IdCard,
} from 'lucide-react';
import {
  RU_CAMPUSES,
  formatMealMenu,
  getBrasiliaTodayIso,
  resolveInitialMealAndDate,
  type RuCampus,
  type RuMealType,
  type FormattedCompositionGroup,
  type FormattedDishVariation,
} from '@/core';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { DatePicker } from '@/components/ui/date-picker';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useRuMenu } from '../hooks/useRuMenu';
import { useStudentWallet } from '../hooks/useStudentWallet';
import { useCredentials } from '../hooks/useCredentials';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';
import { FloatingActionButton } from '@/components/ui/floating-action-button';
import { StudentCardModal } from '@/components/wallet/StudentCardModal';

const SHORT_WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FULL_WEEKDAYS = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDayMeta(iso: string): {
  weekdayShort: string;
  weekdayFull: string;
  dayNum: string;
  dateShort: string;
} {
  const dt = parseIsoLocal(iso);
  const w = dt.getDay();
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return {
    weekdayShort: SHORT_WEEKDAYS[w] ?? 'Dia',
    weekdayFull: FULL_WEEKDAYS[w] ?? 'Dia',
    dayNum: dd,
    dateShort: `${dd}/${mm}`,
  };
}

function getCategoryIcon(category: FormattedCompositionGroup['category']) {
  switch (category) {
    case 'salads':
      return Salad;
    case 'side_dish':
    case 'accompaniments':
      return Utensils;
    case 'soup':
      return Soup;
    case 'bakery':
      return Croissant;
    case 'dessert':
    case 'fruit':
      return Apple;
    case 'drink':
      return CupSoda;
    case 'hot_drink':
      return Coffee;
    case 'extra':
    default:
      return Sparkles;
  }
}

/**
 * Regra de cor Modo Claro vs Modo Escuro:
 * - No modo claro, a linha/card inteiro recebe a cor da dieta (sem fita lateral no canto).
 * - No modo escuro (dark:), o fundo é bg-paper e a fita lateral colorida é exibida no canto esquerdo.
 */
function getDietStyle(diet: FormattedDishVariation['diet']) {
  switch (diet) {
    case 'standard':
      return {
        shortLabel: 'PADRÃO',
        Icon: Drumstick,
        rowSurface: 'bg-pastel-blue dark:bg-paper',
        badgeStyle: 'bg-neo-blue text-white border-ink',
        darkRibbon: 'bg-neo-blue',
      };
    case 'ovolacto':
      return {
        shortLabel: 'OVOLACTO',
        Icon: Egg,
        rowSurface: 'bg-pastel-yellow dark:bg-paper',
        badgeStyle: 'bg-neo-yellow text-ink border-ink',
        darkRibbon: 'bg-neo-yellow',
      };
    case 'vegan':
      return {
        shortLabel: 'VEGANO',
        Icon: Leaf,
        rowSurface: 'bg-pastel-green dark:bg-paper',
        badgeStyle: 'bg-unb-green text-white border-ink',
        darkRibbon: 'bg-unb-green',
      };
  }
}

const MEAL_SEGMENT_OPTIONS: ReadonlyArray<SegmentedOption<RuMealType>> = [
  {
    value: 'breakfast',
    label: (
      <>
        <Coffee className="w-4 h-4 stroke-[2.5]" />
        <span>Desjejum</span>
      </>
    ),
    title: 'Cardápio do Desjejum (7h - 9h30)',
  },
  {
    value: 'lunch',
    label: (
      <>
        <Utensils className="w-4 h-4 stroke-[2.5]" />
        <span>Almoço</span>
      </>
    ),
    title: 'Cardápio do Almoço (11h - 14h30)',
  },
  {
    value: 'dinner',
    label: (
      <>
        <Soup className="w-4 h-4 stroke-[2.5]" />
        <span>Jantar</span>
      </>
    ),
    title: 'Cardápio do Jantar (17h - 19h30)',
  },
];

interface BentoGroupSectionProps {
  group: FormattedCompositionGroup;
}

const BentoGroupSection: React.FC<BentoGroupSectionProps> = ({ group }) => {
  const CategoryIcon = getCategoryIcon(group.category);

  // Saladas mantém a badge amarela de molho; demais grupos (ex.: Panificação/Bebidas)
  // renderizam todas as opções e complementos como lista simples com marcador "•".
  const keepSubGroupAsBadge = group.id === 'salads';
  const listItems = [
    ...group.items.flatMap((alternatives) => alternatives),
    ...(!keepSubGroupAsBadge && group.subGroup ? group.subGroup.chips : []),
  ];

  return (
    <div className="space-y-2 min-w-0">
      {/* Título da categoria com ícone vetorial inline e espaçamento compacto no mobile */}
      <div className="flex items-center gap-1 sm:gap-1.5 text-neutral-500 min-w-0">
        <CategoryIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0 text-neo-blue" />
        <h3 className="text-xs font-extrabold uppercase tracking-tight sm:tracking-normal leading-tight">
          {group.label}
        </h3>
      </div>

      {/* Itens sanitizados em lista uniforme (sem pills) */}
      <ul className="space-y-1.5">
        {listItems.map((itemText, idx) => (
          <li
            key={`${group.id}-item-${idx}`}
            className="flex items-start gap-2 min-w-0"
          >
            {listItems.length > 1 && (
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full bg-neo-blue shrink-0 mt-[0.4375rem]"
              />
            )}
            <span className="text-sm font-black text-black leading-snug">
              {itemText}
            </span>
          </li>
        ))}
      </ul>

      {/* Sub-badge de destaque exclusiva para molhos de salada */}
      {keepSubGroupAsBadge && group.subGroup && group.subGroup.chips.length > 0 && (
        <div className="pt-1 flex flex-wrap items-center gap-1.5">
          {group.subGroup.chips.map((chip, chipIdx) => (
            <span
              key={`${group.id}-sub-${chipIdx}`}
              className="inline-flex items-center px-2 py-0.5 rounded-lg bg-neo-yellow text-ink border-2 border-ink text-xs font-extrabold leading-tight"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export const RuScreen: React.FC = () => {
  const { campus, setCampus, menus, isLoading, error } = useRuMenu();
  const { wallet } = useStudentWallet();
  const { hasCredentials } = useCredentials();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const showWalletFab = isMobile && Boolean(hasCredentials);
  const [cardModalOpen, setCardModalOpen] = useState(false);

  const todayIso = useMemo(() => getBrasiliaTodayIso(), []);
  const initialSelection = useMemo(() => resolveInitialMealAndDate(), []);
  const [selectedMeal, setSelectedMeal] = useState<RuMealType>(initialSelection.meal);
  const [selectedDate, setSelectedDate] = useState<string>(initialSelection.targetDateIso);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const hasSnappedInitialDateRef = React.useRef(false);

  // Agrupa os dias disponíveis em semanas de até 7 dias (Seg..Dom)
  const weeks = useMemo(() => {
    if (menus.length === 0) return [] as typeof menus[];
    const sorted = [...menus].sort((a, b) => a.date.localeCompare(b.date));
    const chunks: typeof menus[] = [];
    let currentChunk: typeof menus = [];

    for (const item of sorted) {
      const dt = parseIsoLocal(item.date);
      if (dt.getDay() === 1 && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
      currentChunk.push(item);
      if (currentChunk.length === 7) {
        chunks.push(currentChunk);
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    return chunks;
  }, [menus]);

  useEffect(() => {
    if (menus.length === 0 || hasSnappedInitialDateRef.current) return;
    hasSnappedInitialDateRef.current = true;
    const hasSelected = menus.some((m) => m.date === selectedDate);
    if (hasSelected) return;

    const target = initialSelection.targetDateIso;
    const exactMatch = menus.find((m) => m.date === target);
    if (exactMatch) {
      setSelectedDate(exactMatch.date);
      return;
    }

    const nextAvailable = menus.find((m) => m.date >= target);
    setSelectedDate(nextAvailable ? nextAvailable.date : menus[menus.length - 1].date);
  }, [menus, selectedDate, initialSelection.targetDateIso]);

  const activeWeekIndex = useMemo(() => {
    if (weeks.length <= 1) return 0;
    const idx = weeks.findIndex((w) => w.some((d) => d.date === selectedDate));
    return idx >= 0 ? idx : 0;
  }, [weeks, selectedDate]);

  const activeWeekDays = weeks[activeWeekIndex] ?? menus;

  const currentDayMenu = useMemo(
    () => menus.find((m) => m.date === selectedDate) ?? null,
    [menus, selectedDate]
  );

  const formattedMeal = useMemo(() => {
    if (menus.length === 0) return null;
    const rawSections = currentDayMenu?.[selectedMeal] ?? [];
    return formatMealMenu(selectedMeal, rawSections);
  }, [menus.length, currentDayMenu, selectedMeal]);

  // Organiza os blocos do Bento Grid (2 colunas):
  // - Almoço/Jantar:
  //   Col 1 Linha 1: Saladas | Col 2 Linha 1: Acompanhamentos
  //   Col 1 Linha 2: Guarnição (+ Sopa se houver) | Col 2 Linha 2: Sobremesa + Bebida empilhados no mesmo card
  // - Desjejum:
  //   Col 1: Panificação | Col 2: Bebidas + Fruta / Extra empilhados
  const bentoCells = useMemo(() => {
    if (!formattedMeal) return [] as FormattedCompositionGroup[][];
    const comp = formattedMeal.composition;
    const byId = new Map(comp.map((g) => [g.id, g]));

    if (selectedMeal === 'breakfast') {
      const cells: FormattedCompositionGroup[][] = [];
      const bakery = byId.get('bakery');
      const hotDrink = byId.get('hot_drink') ?? byId.get('drink');
      const fruitAndExtra = [byId.get('fruit'), byId.get('dessert'), byId.get('extra')].filter(
        (g): g is FormattedCompositionGroup => Boolean(g)
      );

      if (bakery) cells.push([bakery]);
      if (hotDrink && fruitAndExtra.length > 0) {
        cells.push([hotDrink, ...fruitAndExtra]);
      } else {
        if (hotDrink) cells.push([hotDrink]);
        if (fruitAndExtra.length > 0) cells.push(fruitAndExtra);
      }
      return cells;
    }

    const cells: FormattedCompositionGroup[][] = [];
    const salads = byId.get('salads');
    const accomp = byId.get('accompaniments');
    const sideAndSoup = [byId.get('side_dish'), byId.get('soup'), byId.get('toast')].filter(
      (g): g is FormattedCompositionGroup => Boolean(g)
    );
    const dessertAndDrink = [
      byId.get('dessert'),
      byId.get('fruit'),
      byId.get('drink'),
      byId.get('hot_drink'),
    ].filter((g): g is FormattedCompositionGroup => Boolean(g));

    if (salads) cells.push([salads]);
    if (accomp) cells.push([accomp]);
    if (sideAndSoup.length > 0) cells.push(sideAndSoup);
    if (dessertAndDrink.length > 0) cells.push(dessertAndDrink);

    const usedIds = new Set(cells.flat().map((g) => g.id));
    for (const g of comp) {
      if (!usedIds.has(g.id)) {
        cells.push([g]);
      }
    }
    return cells;
  }, [formattedMeal, selectedMeal]);

  const handleShiftWeek = (delta: number) => {
    const nextIdx = activeWeekIndex + delta;
    if (nextIdx < 0 || nextIdx >= weeks.length) return;
    const nextWeek = weeks[nextIdx];
    if (nextWeek && nextWeek.length > 0) {
      setSelectedDate(nextWeek[0].date);
    }
  };

  const activeDateMeta = currentDayMenu
    ? formatDayMeta(currentDayMenu.date)
    : formatDayMeta(selectedDate);

  const weekRangeLabel = useMemo(() => {
    if (activeWeekDays.length === 0) return '';
    const first = formatDayMeta(activeWeekDays[0].date).dateShort;
    const last = formatDayMeta(activeWeekDays[activeWeekDays.length - 1].date).dateShort;
    return first === last ? first : `${first} – ${last}`;
  }, [activeWeekDays]);

  const dayPickerGrid = (
    <div className="space-y-3">
      {activeWeekDays.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => handleShiftWeek(-1)}
            disabled={activeWeekIndex === 0}
            aria-label="Semana anterior"
            className="cursor-pointer w-12 h-12 flex items-center justify-center rounded-xl border-2 border-ink bg-paper hover:bg-neutral-100 text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-35 disabled:cursor-not-allowed transition-[transform,box-shadow,background-color] duration-150 ease-out"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
          </button>

          <span className="text-xs font-black uppercase tracking-wider text-neutral-600 tabular-nums">
            Semana {weekRangeLabel}
          </span>

          <button
            type="button"
            onClick={() => handleShiftWeek(1)}
            disabled={activeWeekIndex >= weeks.length - 1}
            aria-label="Próxima semana"
            className="cursor-pointer w-12 h-12 flex items-center justify-center rounded-xl border-2 border-ink bg-paper hover:bg-neutral-100 text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-35 disabled:cursor-not-allowed transition-[transform,box-shadow,background-color] duration-150 ease-out"
          >
            <ChevronRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>
      )}

      <div
        role="listbox"
        aria-label="Dias disponíveis do cardápio"
        className="grid grid-cols-7 gap-1.5"
      >
        {activeWeekDays.map((dayMenu) => {
          const info = formatDayMeta(dayMenu.date);
          const isSelected = currentDayMenu?.date === dayMenu.date;
          const isToday = dayMenu.date === todayIso;

          return (
            <button
              key={dayMenu.date}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={`${info.weekdayFull}, ${info.dateShort}${isToday ? ' (Hoje)' : ''}`}
              onClick={() => {
                setSelectedDate(dayMenu.date);
                setDayPickerOpen(false);
              }}
              className={`cursor-pointer min-h-[54px] py-2 px-0.5 rounded-xl border-2 border-ink flex flex-col items-center justify-center transition-[transform,box-shadow,background-color] duration-150 ease-out select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 ${
                isSelected
                  ? 'bg-neo-blue text-white shadow-neo-sm hover:bg-neo-blueHover hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
                  : isToday
                    ? 'bg-neo-yellow text-ink shadow-neo-sm hover:bg-neo-yellowHover hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
                    : 'bg-paper text-black hover:bg-neutral-100 shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none'
              }`}
            >
              <span
                className={`text-xs uppercase leading-none font-extrabold ${
                  isSelected
                    ? 'text-white/90'
                    : isToday
                      ? 'text-ink/80'
                      : 'text-neutral-500'
                }`}
              >
                {info.weekdayShort}
              </span>
              <span className="text-sm font-black tabular-nums leading-tight mt-1">
                {info.dayNum}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <PageContainer className="pb-[calc(7.5rem+env(safe-area-inset-bottom))] md:pb-16">
      {/* PageHeader no padrão do sistema com horário da refeição como sufixo */}
      <PageHeader
        title="Cardápio RU"
        subtitle={formattedMeal ? `(${formattedMeal.hoursLabel})` : null}
      />

      <div className="space-y-3 md:space-y-4">
      {/* 1. CARD UNIFICADO: Local (Select) + Seletor de Data + Segmented Control */}
      <section
        aria-label="Seleção de campus, dia e refeição"
        className="bg-paper border-2 border-ink rounded-lg p-3 md:p-4 shadow-neo-sm md:shadow-neo space-y-2.5 md:space-y-3"
      >
        {/* Linha 1: Seletor de Campus + Seletor de Dia (BottomSheet no mobile, DatePicker padrão no desktop) */}
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex-1 min-w-0">
            <Select
              value={campus}
              onValueChange={(val) => {
                if (val) setCampus(val as RuCampus);
              }}
            >
              <SelectTrigger
                aria-label="Selecionar campus do RU"
                className="h-12 text-xs sm:text-sm font-black"
              >
                <MapPin className="w-4 h-4 stroke-[2.5] text-neo-blue shrink-0" />
                <SelectValue>Campus {campus}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {RU_CAMPUSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    Campus {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isMobile ? (
            <button
              type="button"
              onClick={() => setDayPickerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={dayPickerOpen}
              aria-label={`Selecionar dia do cardápio (atual: ${activeDateMeta.weekdayFull}, ${activeDateMeta.dateShort})`}
              className="cursor-pointer shrink-0 h-12 px-3.5 bg-paper hover:bg-neutral-100 text-black border-2 border-ink rounded-xl shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 inline-flex items-center gap-2 text-xs sm:text-sm font-black transition-[transform,box-shadow,background-color] duration-150 ease-out"
            >
              <Calendar className="w-4 h-4 stroke-[2.5] text-neo-blue shrink-0" />
              <span className="tabular-nums">
                {activeDateMeta.weekdayShort}, {activeDateMeta.dateShort}
              </span>
            </button>
          ) : (
            <div className="shrink-0 w-44 lg:w-48">
              <DatePicker
                value={selectedDate}
                onChange={setSelectedDate}
                align="end"
                className="h-12 px-3.5 text-xs sm:text-sm font-black"
              />
            </div>
          )}
        </div>

        <SegmentedControl
          ariaLabel="Selecionar refeição"
          options={MEAL_SEGMENT_OPTIONS}
          value={selectedMeal}
          onValueChange={setSelectedMeal}
          size="lg"
        />
      </section>

      {/* Seletor de Dias no mobile (< md): BottomSheet */}
      {isMobile && (
        <BottomSheet
          open={dayPickerOpen}
          onClose={() => setDayPickerOpen(false)}
          backdrop
          backdropClassName="md:hidden z-40"
          id="ru-day-picker-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Selecionar dia do cardápio"
          className="fixed inset-x-0 bottom-0 w-full z-50 md:hidden"
          portal
        >
          <div className="flex items-center gap-2 px-4 pb-3 border-b-2 border-black/15">
            <Calendar className="w-4 h-4 stroke-[2.5] text-neo-blue shrink-0" />
            <h2 className="text-base font-black text-black">
              Selecionar dia
            </h2>
          </div>
          <div className="px-3 pt-3.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            {dayPickerGrid}
          </div>
        </BottomSheet>
      )}

      {error && menus.length === 0 && (
        <div className="bg-paper border-2 border-ink rounded-lg p-3.5 shadow-neo-sm md:shadow-neo flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-neo-danger shrink-0 mt-0.5 stroke-[2.5]" />
          <p className="text-xs font-bold text-black">{error}</p>
        </div>
      )}

      {isLoading && !formattedMeal ? (
        <div className="space-y-3">
          <div className="h-32 bg-neutral-200 rounded animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-32 bg-neutral-200 rounded animate-pulse" />
            <div className="h-32 bg-neutral-200 rounded animate-pulse" />
            <div className="h-32 bg-neutral-200 rounded animate-pulse" />
            <div className="h-32 bg-neutral-200 rounded animate-pulse" />
          </div>
        </div>
      ) : formattedMeal ? (
        formattedMeal.isEmpty ? (
          <div className="bg-paper border-2 border-ink rounded-lg p-6 text-center shadow-neo-sm md:shadow-neo">
            <img
              src="/sarue-doubt.png"
              alt=""
              aria-hidden="true"
              className="w-24 h-24 mx-auto mb-1.5 object-contain select-none pointer-events-none"
            />
            <p className="text-sm font-black text-black">
              Cardápio não publicado para {formattedMeal.title.toLowerCase()} nesta data
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 2. PRATOS PRINCIPAIS UNIFICADOS EM UM ÚNICO CARD */}
            {formattedMeal.variations.length > 0 && (
              <section
                aria-label="Pratos principais"
                className="border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo overflow-hidden divide-y-2 divide-ink bg-paper"
              >
                {formattedMeal.variations.map((variation) => {
                  const style = getDietStyle(variation.diet);
                  const DietIcon = style.Icon;

                  return (
                    <div
                      key={variation.diet}
                      className={`relative px-3.5 py-3 flex items-center justify-between gap-3 ${style.rowSurface}`}
                    >
                      {/* Fita lateral no canto: APENAS no dark mode (no modo claro a linha toda tem a cor) */}
                      <div
                        aria-hidden="true"
                        className={`hidden dark:block absolute inset-y-0 left-0 w-1.5 ${style.darkRibbon}`}
                      />

                      <span
                        className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border-2 text-xs font-black uppercase tracking-wide dark:ml-1 ${style.badgeStyle}`}
                      >
                        <DietIcon className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{style.shortLabel}</span>
                      </span>

                      <p className="min-w-0 flex-1 text-right text-sm sm:text-base font-black text-black leading-snug">
                        {variation.items.join(' • ')}
                      </p>
                    </div>
                  );
                })}
              </section>
            )}

            {/* 3. BENTO GRID (2 COLUNAS) PARA O RESTANTE DO CARDÁPIO */}
            {bentoCells.length > 0 && (
              <section
                aria-label="Composição da refeição"
                className="grid grid-cols-2 gap-2.5 sm:gap-3"
              >
                {bentoCells.map((cellGroups, cellIdx) => (
                  <article
                    key={cellGroups.map((g) => g.id).join('-') || cellIdx}
                    className="min-w-0 bg-paper border-2 border-ink rounded-lg p-3 sm:p-3.5 shadow-neo-sm md:shadow-neo flex flex-col justify-between divide-y-2 divide-black/15"
                  >
                    {cellGroups.map((group, gIdx) => (
                      <div
                        key={group.id}
                        className={gIdx > 0 ? 'pt-3 mt-3' : ''}
                      >
                        <BentoGroupSection group={group} />
                      </div>
                    ))}
                  </article>
                ))}
              </section>
            )}
          </div>
        )
      ) : null}
      </div>

      {showWalletFab && (
        <>
          <FloatingActionButton
            onClick={() => setCardModalOpen(true)}
            icon={IdCard}
            aria-label="Abrir carteirinha estudantil ampliada"
            title="Abrir Carteirinha Estudantil"
            className="md:hidden"
          />

          <StudentCardModal
            card={cardModalOpen ? 'ru' : null}
            wallet={wallet}
            onClose={() => setCardModalOpen(false)}
          />
        </>
      )}
    </PageContainer>
  );
};
