export type RuMealType = 'breakfast' | 'lunch' | 'dinner';

export type RuCampus =
  | 'Darcy Ribeiro'
  | 'Ceilândia'
  | 'Gama'
  | 'Planaltina'
  | 'Fazenda Água Limpa';

export const RU_CAMPUSES: RuCampus[] = [
  'Darcy Ribeiro',
  'Ceilândia',
  'Gama',
  'Planaltina',
  'Fazenda Água Limpa',
];

export interface RawRuMenuSection {
  key: string;
  label: string;
  items: string[];
}

export interface RawRuDailyMenu {
  date: string; // YYYY-MM-DD
  breakfast: RawRuMenuSection[];
  lunch: RawRuMenuSection[];
  dinner: RawRuMenuSection[];
}

export interface FormattedDishVariation {
  diet: 'standard' | 'ovolacto' | 'vegan';
  badgeLabel: string;
  roleLabel: string;
  items: string[];
}

export interface FormattedCompositionGroup {
  id: string;
  label: string;
  category:
    | 'salads'
    | 'side_dish'
    | 'accompaniments'
    | 'soup'
    | 'bakery'
    | 'dessert'
    | 'fruit'
    | 'drink'
    | 'hot_drink'
    | 'extra';
  /** Lista principal de itens (já sanitizados e separados em alternativas/chips quando aplicável) */
  items: string[][];
  /** Sub-badges ou complementos agrupados (ex.: "Molho ácido" em Saladas, ou "Complemento de panificação" em Panificação) */
  subGroup?: {
    label: string;
    chips: string[];
  };
}

export interface FormattedMealMenu {
  meal: RuMealType;
  title: string;
  hoursLabel: string;
  variations: FormattedDishVariation[];
  composition: FormattedCompositionGroup[];
  isEmpty: boolean;
}

export const MEAL_METADATA: Record<
  RuMealType,
  { title: string; shortLabel: string; hoursLabel: string }
> = {
  breakfast: {
    title: 'Desjejum',
    shortLabel: 'Desjejum',
    hoursLabel: '7h - 9h30',
  },
  lunch: {
    title: 'Almoço',
    shortLabel: 'Almoço',
    hoursLabel: '11h - 14h30',
  },
  dinner: {
    title: 'Jantar',
    shortLabel: 'Jantar',
    hoursLabel: '17h - 19h30',
  },
};

/**
 * Quebra alternativas com "OU" / "ou" em itens individuais limpos.
 * Ex: "Leite integral OU Bebida de soja" -> ["Leite integral", "Bebida de soja"]
 * Ex: "Pão francês ou Pão careca ou Pão integral" -> ["Pão francês", "Pão careca", "Pão integral"]
 */
export function splitAlternatives(raw: string): string[] {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/\s+ou\s*$/i, '')
    .trim();
  if (!cleaned) return [];

  return cleaned
    .split(/\s+ou\s+/i)
    .map((part) => {
      const p = part.trim();
      if (!p) return '';
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .filter(Boolean);
}

/**
 * Separa acompanhamentos colados na planilha do RU.
 * Ex: "Arroz branco e integral Feijão preto" -> ["Arroz branco e integral", "Feijão preto"]
 */
export function splitJoinedAccompaniments(raw: string): string[] {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  return cleaned
    .split(/\s+(?=(?:Feij[ãa]o|Arroz|Farofa|Lentilha|Gr[ãa]o[- ]de[- ]bico)\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normaliza o sabor de refresco para "Refresco de <sabor>".
 * Ex: "Acerola" -> "Refresco de acerola"
 */
export function formatRefreshmentItem(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/^refresco\b/i.test(cleaned)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  const lowerFlavor = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `Refresco de ${lowerFlavor}`;
}

/**
 * Normaliza o texto de molho de salada para badge "Molho <tipo>".
 * Ex: "Ácido" -> "Molho ácido"
 */
export function formatSaladDressingBadge(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/^molho\b/i.test(cleaned)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  const lower = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return `Molho ${lower}`;
}

export const UNB_TIMEZONE = 'America/Sao_Paulo';

export interface BrasiliaDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Extrai ano, mês, dia, hora e minuto no fuso horário de Brasília (UnB),
 * evitando que WebViews em UTC mudem o dia às 21h (-03:00).
 */
export function getBrasiliaDateParts(now: Date = new Date()): BrasiliaDateParts {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: UNB_TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const getNum = (type: Intl.DateTimeFormatPartTypes) => {
      const value = parts.find((p) => p.type === type)?.value;
      return value ? Number(value) : NaN;
    };
    const year = getNum('year');
    const month = getNum('month');
    const day = getNum('day');
    const hour = getNum('hour');
    const minute = getNum('minute');

    if (
      Number.isFinite(year) &&
      Number.isFinite(month) &&
      Number.isFinite(day) &&
      Number.isFinite(hour) &&
      Number.isFinite(minute)
    ) {
      return { year, month, day, hour: hour === 24 ? 0 : hour, minute };
    }
  } catch {
    // Fallback para relógio local caso Intl não suporte timeZone
  }

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

/**
 * Retorna a data atual no formato YYYY-MM-DD no fuso de Brasília (`America/Sao_Paulo`).
 */
export function getBrasiliaTodayIso(now: Date = new Date()): string {
  const { year, month, day } = getBrasiliaDateParts(now);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Seleciona automaticamente a refeição atual/próxima e a data alvo com base no horário:
 * - Antes de 09:30 -> Desjejum de hoje
 * - 09:30 até 14:29 -> Almoço de hoje
 * - 14:30 até 19:59 -> Jantar de hoje
 * - A partir de 20:00 -> Desjejum do dia seguinte (+1 dia)
 */
export function resolveInitialMealAndDate(now?: Date): {
  meal: RuMealType;
  targetDateIso: string;
  advancedToNextDay: boolean;
} {
  // Quando omitido, usa explicitamente Brasília (America/Sao_Paulo);
  // quando passado nos testes, respeita o horário local da instância fornecida.
  const parts: BrasiliaDateParts = now
    ? {
        year: now.getFullYear(),
        month: now.getMonth() + 1,
        day: now.getDate(),
        hour: now.getHours(),
        minute: now.getMinutes(),
      }
    : getBrasiliaDateParts();

  const minutes = parts.hour * 60 + parts.minute;
  let meal: RuMealType = 'breakfast';
  let advancedToNextDay = false;

  if (minutes < 9 * 60 + 30) {
    meal = 'breakfast';
  } else if (minutes < 14 * 60 + 30) {
    meal = 'lunch';
  } else if (minutes < 20 * 60) {
    meal = 'dinner';
  } else {
    meal = 'breakfast';
    advancedToNextDay = true;
  }

  const targetUtc = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + (advancedToNextDay ? 1 : 0))
  );
  const y = targetUtc.getUTCFullYear();
  const m = String(targetUtc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(targetUtc.getUTCDate()).padStart(2, '0');

  return {
    meal,
    targetDateIso: `${y}-${m}-${d}`,
    advancedToNextDay,
  };
}

/**
 * Transforma as seções brutas de uma refeição do PDF na estrutura higienizada e agrupada para a UI.
 */
export function formatMealMenu(
  meal: RuMealType,
  rawSections: RawRuMenuSection[]
): FormattedMealMenu {
  const meta = MEAL_METADATA[meal];
  const byKey = new Map<string, RawRuMenuSection>();
  for (const sec of rawSections) {
    byKey.set(sec.key, sec);
  }

  // 1. Variações de Prato Principal / Complemento (Padrão, Ovolactovegetariano, Vegano)
  const variations: FormattedDishVariation[] = [];
  const variationConfigs: Array<{
    keys: string[];
    diet: FormattedDishVariation['diet'];
    badgeLabel: string;
    roleLabel: string;
  }> = [
    {
      keys: ['main_dish', 'breakfast_complement'],
      diet: 'standard',
      badgeLabel: 'Padrão',
      roleLabel: meal === 'breakfast' ? 'Complemento padrão' : 'Prato principal',
    },
    {
      keys: ['ovolacto_dish', 'ovolacto_complement'],
      diet: 'ovolacto',
      badgeLabel: 'Ovolactovegetariano',
      roleLabel: meal === 'breakfast' ? 'Complemento vegetariano' : 'Opção ovolactovegetariana',
    },
    {
      keys: ['vegan_dish', 'vegan_complement'],
      diet: 'vegan',
      badgeLabel: 'Vegano',
      roleLabel: meal === 'breakfast' ? 'Complemento vegano' : 'Opção vegetariana estrita',
    },
  ];

  for (const cfg of variationConfigs) {
    const found = cfg.keys.map((k) => byKey.get(k)).find(Boolean);
    if (found && found.items.length > 0) {
      const items = found.items.flatMap(splitAlternatives);
      if (items.length > 0) {
        variations.push({
          diet: cfg.diet,
          badgeLabel: cfg.badgeLabel,
          roleLabel: cfg.roleLabel,
          items,
        });
      }
    }
  }

  // 2. Composição agrupada e sanitizada
  const composition: FormattedCompositionGroup[] = [];

  // 2.1. Saladas unificadas (Salada 1 + Salada 2 + Molho para salada como badge)
  const salad1 = byKey.get('salad_1')?.items ?? [];
  const salad2 = byKey.get('salad_2')?.items ?? [];
  const dressing = byKey.get('salad_dressing')?.items ?? [];
  if (salad1.length > 0 || salad2.length > 0 || dressing.length > 0) {
    const saladItems = [...salad1, ...salad2]
      .map((item) => splitAlternatives(item))
      .filter((arr) => arr.length > 0);
    const dressingChips = dressing
      .flatMap(splitAlternatives)
      .map(formatSaladDressingBadge)
      .filter(Boolean);

    composition.push({
      id: 'salads',
      label: 'Saladas',
      category: 'salads',
      items: saladItems,
      subGroup:
        dressingChips.length > 0
          ? {
              label: 'Molho',
              chips: dressingChips,
            }
          : undefined,
    });
  }

  // 2.2. Guarnição
  const sideDish = byKey.get('side_dish');
  if (sideDish && sideDish.items.length > 0) {
    composition.push({
      id: 'side_dish',
      label: 'Guarnição',
      category: 'side_dish',
      items: sideDish.items.map(splitAlternatives).filter((a) => a.length > 0),
    });
  }

  // 2.3. Acompanhamentos (separando "Arroz branco e integral Feijão preto")
  const accomp = byKey.get('accompaniments');
  if (accomp && accomp.items.length > 0) {
    const separated = accomp.items
      .flatMap(splitJoinedAccompaniments)
      .map(splitAlternatives)
      .filter((a) => a.length > 0);
    if (separated.length > 0) {
      composition.push({
        id: 'accompaniments',
        label: 'Acompanhamentos',
        category: 'accompaniments',
        items: separated,
      });
    }
  }

  // 2.4. Sopa & Torrada (Jantar)
  const soup = byKey.get('soup');
  const toast = byKey.get('toast');
  if (soup && soup.items.length > 0) {
    const toastChips = (toast?.items ?? []).flatMap(splitAlternatives);
    composition.push({
      id: 'soup',
      label: 'Sopa',
      category: 'soup',
      items: soup.items.map(splitAlternatives).filter((a) => a.length > 0),
      subGroup:
        toastChips.length > 0
          ? {
              label: 'Acompanha',
              chips: toastChips,
            }
          : undefined,
    });
  } else if (toast && toast.items.length > 0) {
    composition.push({
      id: 'toast',
      label: 'Torrada',
      category: 'bakery',
      items: toast.items.map(splitAlternatives).filter((a) => a.length > 0),
    });
  }

  // 2.5. Panificação + Gordura ("Complemento de panificação")
  const bakery = byKey.get('bakery');
  const spread = byKey.get('spread');
  if ((bakery && bakery.items.length > 0) || (spread && spread.items.length > 0)) {
    const bakeryItems = (bakery?.items ?? [])
      .map(splitAlternatives)
      .filter((a) => a.length > 0);
    const spreadChips = (spread?.items ?? []).flatMap(splitAlternatives);

    composition.push({
      id: 'bakery',
      label: 'Panificação',
      category: 'bakery',
      items: bakeryItems,
      subGroup:
        spreadChips.length > 0
          ? {
              label: 'Complemento de panificação',
              chips: spreadChips,
            }
          : undefined,
    });
  }

  // 2.6. Opção extra (ex.: Mingau de aveia no Desjejum)
  const extra = byKey.get('extra');
  if (extra && extra.items.length > 0) {
    composition.push({
      id: 'extra',
      label: 'Opção extra',
      category: 'extra',
      items: extra.items.map(splitAlternatives).filter((a) => a.length > 0),
    });
  }

  // 2.7. Sobremesa / Fruta
  const dessert = byKey.get('dessert');
  if (dessert && dessert.items.length > 0) {
    composition.push({
      id: 'dessert',
      label: 'Sobremesa',
      category: 'dessert',
      items: dessert.items.map(splitAlternatives).filter((a) => a.length > 0),
    });
  }

  const fruit = byKey.get('fruit');
  if (fruit && fruit.items.length > 0) {
    composition.push({
      id: 'fruit',
      label: 'Fruta',
      category: 'fruit',
      items: fruit.items.map(splitAlternatives).filter((a) => a.length > 0),
    });
  }

  // 2.8. Bebidas quentes (Desjejum) e Bebida / Refresco (Almoço/Jantar)
  const hotDrink = byKey.get('hot_drink');
  if (hotDrink && hotDrink.items.length > 0) {
    composition.push({
      id: 'hot_drink',
      label: 'Bebidas',
      category: 'hot_drink',
      items: hotDrink.items.map(splitAlternatives).filter((a) => a.length > 0),
    });
  }

  const drink = byKey.get('drink');
  if (drink && drink.items.length > 0) {
    const isRefreshment =
      /refresco/i.test(drink.label) || meal === 'lunch' || meal === 'dinner';
    const formattedDrinkItems = drink.items
      .map((item) =>
        splitAlternatives(item).map((alt) =>
          isRefreshment ? formatRefreshmentItem(alt) : alt
        )
      )
      .filter((a) => a.length > 0);

    composition.push({
      id: 'drink',
      label: 'Bebida',
      category: 'drink',
      items: formattedDrinkItems,
    });
  }

  return {
    meal,
    title: meta.title,
    hoursLabel: meta.hoursLabel,
    variations,
    composition,
    isEmpty: variations.length === 0 && composition.length === 0,
  };
}
