import { renderPageAsImage } from 'unpdf';
import {
  RU_CAMPUSES,
  getBrasiliaDateParts,
  type RuCampus,
  type RawRuDailyMenu,
} from '../domain/utils/ru-menu-formatter';
import { getDatabase } from './sqlite-feed.repo';
import type {
  StudentWalletSyncPayload,
  RuStatementEntry,
} from './bindings';

export type { StudentWalletSyncPayload, RuStatementEntry };

export const CAMPUS_STORAGE_KEY = 'sarue_ru_campus_v1';
const WALLET_ROW_ID = 'current';

interface SqliteRuMenuRow {
  campus: string;
  date: string;
  payload: string;
  updated_at: string;
}

export interface CachedWalletRecord extends StudentWalletSyncPayload {
  /** Imagem renderizada e recortada da carteirinha oficial a partir do PDF do SIGAA (para exibição offline instantânea) */
  renderedCardDataUrl?: string | null;
  /** Página inteira renderizada do PDF oficial */
  renderedFullPageDataUrl?: string | null;
}

const inMemoryMenus = new Map<RuCampus, RawRuDailyMenu[]>();
let inMemoryWalletPayload: CachedWalletRecord | null = null;
let inMemoryWalletUpdatedAt: string | null = null;

const ruWalletListeners = new Set<() => void>();
const studentWalletListeners = new Set<() => void>();

export function subscribeToRuWalletUpdates(listener: () => void): () => void {
  ruWalletListeners.add(listener);
  return () => {
    ruWalletListeners.delete(listener);
  };
}

export function notifyRuWalletListeners(): void {
  ruWalletListeners.forEach((fn) => fn());
}

export function subscribeToStudentWalletUpdates(
  listener: () => void
): () => void {
  studentWalletListeners.add(listener);
  return () => {
    studentWalletListeners.delete(listener);
  };
}

export function notifyStudentWalletListeners(): void {
  studentWalletListeners.forEach((fn) => fn());
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getSavedRuCampus(): RuCampus {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(CAMPUS_STORAGE_KEY) as RuCampus | null;
      if (saved && RU_CAMPUSES.includes(saved)) return saved;
    } catch {}
  }
  return 'Darcy Ribeiro';
}

function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:application\/pdf;base64,/, '').trim();
  const binaryString =
    typeof atob !== 'undefined'
      ? atob(clean)
      : Buffer.from(clean, 'base64').toString('binary');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Recorta automaticamente as margens brancas excessivas da folha A4 do PDF
 * para destacar o bloco oficial da Carteirinha Estudantil do SIGAA.
 */
async function cropNonWhiteBoundingBox(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (w <= 0 || h <= 0) {
          resolve(dataUrl);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, w, h);
        let minX = w;
        let minY = h;
        let maxX = 0;
        let maxY = 0;
        let found = false;

        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];
            if (a > 16 && (r < 245 || g < 245 || b < 245)) {
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
              found = true;
            }
          }
        }

        if (!found) {
          resolve(dataUrl);
          return;
        }

        const pad = Math.round(Math.min(w, h) * 0.035);
        const cropX = Math.max(0, minX - pad);
        const cropY = Math.max(0, minY - pad);
        const cropW = Math.min(w - cropX, maxX - minX + pad * 2);
        const cropH = Math.min(h - cropY, maxY - minY + pad * 2);

        if (cropW < 50 || cropH < 50) {
          resolve(dataUrl);
          return;
        }

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          resolve(dataUrl);
          return;
        }
        outCtx.fillStyle = '#FFFFFF';
        outCtx.fillRect(0, 0, cropW, cropH);
        outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        resolve(outCanvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Renderiza a primeira página do PDF oficial da Carteirinha Estudantil do SIGAA
 * em alta definição (DataURL PNG) para exibição offline fiel ao documento oficial.
 */
export async function renderOfficialStudentCardPdf(
  pdfBase64: string
): Promise<{ croppedDataUrl: string; fullPageDataUrl: string } | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  try {
    const bytes = base64ToUint8Array(pdfBase64);
    const fullPageDataUrl = await renderPageAsImage(bytes, 1, {
      scale: 2.5,
      toDataURL: true,
    });
    const croppedDataUrl = await cropNonWhiteBoundingBox(fullPageDataUrl);
    return { croppedDataUrl, fullPageDataUrl };
  } catch (e) {
    console.warn('[ru-wallet.service] Falha ao renderizar PDF da carteirinha:', e);
    return null;
  }
}

function buildFallbackWeekMenus(): RawRuDailyMenu[] {
  const { year, month, day } = getBrasiliaDateParts();
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = todayUtc.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const days: RawRuDailyMenu[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(year, month - 1, day + mondayOffset + i));
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`;

    days.push({
      date: iso,
      breakfast: [
        {
          key: 'hot_drink',
          label: 'Bebidas quentes',
          items: ['Leite integral OU Bebida de soja', 'Café preto'],
        },
        {
          key: 'bakery',
          label: 'Panificação',
          items: ['Pão francês ou Pão careca ou Pão integral'],
        },
        {
          key: 'spread',
          label: 'Gordura',
          items: ['Manteiga ou creme vegetal'],
        },
        {
          key: 'breakfast_complement',
          label: 'Complemento padrão',
          items: [i % 2 === 0 ? 'Queijo muçarela' : 'Ovos mexidos'],
        },
        {
          key: 'ovolacto_complement',
          label: 'Complemento ovolactovegetariano',
          items: ['Omelete com ervas'],
        },
        {
          key: 'vegan_complement',
          label: 'Complemento vegetariano estrito',
          items: ['Pasta de grão-de-bico (Homus)'],
        },
        {
          key: 'fruit',
          label: 'Fruta',
          items: [i % 2 === 0 ? 'Mamão' : 'Melão'],
        },
      ],
      lunch: [
        { key: 'salad_1', label: 'Salada 1', items: ['Alface lisa'] },
        { key: 'salad_2', label: 'Salada 2', items: ['Pepino agridoce'] },
        { key: 'salad_dressing', label: 'Molho para salada', items: ['Ácido'] },
        {
          key: 'main_dish',
          label: 'Prato principal padrão',
          items: [i % 2 === 0 ? 'Frango assado com azeitonas' : 'Iscas bovinas aceboladas'],
        },
        {
          key: 'ovolacto_dish',
          label: 'Opção ovolactovegetariana',
          items: ['Fricassê de grão-de-bico com queijo'],
        },
        {
          key: 'vegan_dish',
          label: 'Opção vegetariana estrita',
          items: ['Fricassê de grão-de-bico com leite de coco'],
        },
        {
          key: 'side_dish',
          label: 'Guarnição',
          items: ['Repolho com maçã e passas'],
        },
        {
          key: 'accompaniments',
          label: 'Acompanhamentos',
          items: ['Arroz branco e integral Feijão preto'],
        },
        { key: 'dessert', label: 'Sobremesa', items: ['Abacaxi'] },
        { key: 'drink', label: 'Bebida (refresco de)', items: ['Acerola'] },
      ],
      dinner: [
        { key: 'salad_1', label: 'Salada 1', items: ['Rúcula e acelga'] },
        { key: 'salad_2', label: 'Salada 2', items: ['Beterraba ralada'] },
        { key: 'salad_dressing', label: 'Molho para salada', items: ['Ervas finas'] },
        {
          key: 'main_dish',
          label: 'Prato principal padrão',
          items: ['Picadinho bovino ao molho madeira'],
        },
        {
          key: 'ovolacto_dish',
          label: 'Opção ovolactovegetariana',
          items: ['Quiche de alho-poró'],
        },
        {
          key: 'vegan_dish',
          label: 'Opção vegetariana estrita',
          items: ['Moqueca de banana-da-terra com tofu'],
        },
        {
          key: 'side_dish',
          label: 'Guarnição',
          items: ['Purê de batata-doce'],
        },
        {
          key: 'accompaniments',
          label: 'Acompanhamentos',
          items: ['Arroz branco e integral Feijão carioca'],
        },
        { key: 'soup', label: 'Sopa', items: ['Canja de legumes'] },
        { key: 'toast', label: 'Torrada', items: ['Torrada temperada'] },
        { key: 'dessert', label: 'Sobremesa', items: ['Laranja'] },
        { key: 'drink', label: 'Bebida (refresco de)', items: ['Caju'] },
      ],
    });
  }
  return days;
}

export async function loadCachedRuMenus(
  campus: RuCampus
): Promise<{ menus: RawRuDailyMenu[]; lastUpdatedAt: string | null }> {
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.select<SqliteRuMenuRow[]>(
        'SELECT campus, date, payload, updated_at FROM ru_menus WHERE campus = $1 ORDER BY date ASC;',
        [campus]
      );
      if (rows && rows.length > 0) {
        const menus: RawRuDailyMenu[] = [];
        let latest = rows[0].updated_at;
        for (const r of rows) {
          try {
            const parsed = JSON.parse(r.payload) as RawRuDailyMenu;
            if (parsed && parsed.date) {
              menus.push(parsed);
            }
            if (r.updated_at > latest) latest = r.updated_at;
          } catch {}
        }
        return { menus, lastUpdatedAt: latest };
      }
    } catch (e) {
      console.warn('[ru-wallet.service] Falha ao ler cache SQLite:', e);
    }
  }

  const mem = inMemoryMenus.get(campus);
  if (mem && mem.length > 0) {
    return { menus: mem, lastUpdatedAt: new Date().toISOString() };
  }
  return { menus: [], lastUpdatedAt: null };
}

export async function fetchAndCacheRuMenus(
  campus: RuCampus
): Promise<{ menus: RawRuDailyMenu[]; updatedAt: string }> {
  let fetched: RawRuDailyMenu[];

  if (isTauriRuntime()) {
    const { commands } = await import('./bindings');
    const res = await commands.fetchRuMenu(campus);
    if (res.status === 'ok' && res.data && res.data.length > 0) {
      fetched = res.data;
    } else if (res.status === 'error') {
      throw new Error(res.error);
    } else {
      throw new Error('Nenhum cardápio retornado pelo site do RU.');
    }
  } else {
    fetched = buildFallbackWeekMenus();
  }

  const nowIso = new Date().toISOString();
  inMemoryMenus.set(campus, fetched);
  const db = await getDatabase();
  if (db) {
    try {
      for (const m of fetched) {
        await db.execute(
          `INSERT INTO ru_menus (campus, date, payload, updated_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT(campus, date) DO UPDATE SET payload = $3, updated_at = $4;`,
          [campus, m.date, JSON.stringify(m), nowIso]
        );
      }
    } catch (e) {
      console.warn('[ru-wallet.service] Falha ao salvar cardápios no SQLite:', e);
    }
  }

  notifyRuWalletListeners();
  return { menus: fetched, updatedAt: nowIso };
}

export async function loadCachedStudentWallet(): Promise<{
  payload: CachedWalletRecord | null;
  updatedAt: string | null;
}> {
  const db = await getDatabase();
  if (db) {
    try {
      const rows = await db.select<{ payload: string; updated_at: string }[]>(
        'SELECT payload, updated_at FROM student_wallet WHERE id = $1 LIMIT 1;',
        [WALLET_ROW_ID]
      );
      if (rows && rows.length > 0) {
        const parsed = JSON.parse(rows[0].payload) as CachedWalletRecord;
        inMemoryWalletPayload = parsed;
        inMemoryWalletUpdatedAt = rows[0].updated_at;
        return { payload: parsed, updatedAt: rows[0].updated_at };
      }
    } catch (e) {
      console.warn('[ru-wallet.service] Falha ao ler carteira no SQLite:', e);
    }
  }
  return { payload: inMemoryWalletPayload, updatedAt: inMemoryWalletUpdatedAt };
}

export async function saveCachedStudentWallet(
  record: CachedWalletRecord,
  notify = true
): Promise<string> {
  const nowIso = new Date().toISOString();
  inMemoryWalletPayload = record;
  inMemoryWalletUpdatedAt = nowIso;

  const db = await getDatabase();
  if (db) {
    try {
      await db.execute(
        `INSERT INTO student_wallet (id, payload, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT(id) DO UPDATE SET payload = $2, updated_at = $3;`,
        [WALLET_ROW_ID, JSON.stringify(record), nowIso]
      );
    } catch (e) {
      console.warn('[ru-wallet.service] Falha ao salvar carteira no SQLite:', e);
    }
  }
  if (notify) {
    notifyStudentWalletListeners();
  }
  return nowIso;
}

export async function fetchAndCacheStudentWallet(
  matricula: string,
  senha: string,
  fallbackCpf?: string | null
): Promise<CachedWalletRecord> {
  const cached = await loadCachedStudentWallet();
  let merged: CachedWalletRecord;

  if (isTauriRuntime()) {
    const { commands } = await import('./bindings');
    const res = await commands.fetchStudentWallet(matricula, senha);
    if (res.status === 'ok' && res.data) {
      const pdfBase64 =
        res.data.ruCardPdfBase64 ?? cached.payload?.ruCardPdfBase64 ?? null;
      const pdfChanged = Boolean(
        pdfBase64 && pdfBase64 !== cached.payload?.ruCardPdfBase64
      );
      let renderedCardDataUrl = cached.payload?.renderedCardDataUrl ?? null;
      let renderedFullPageDataUrl =
        cached.payload?.renderedFullPageDataUrl ?? null;

      if (
        pdfBase64 &&
        (pdfChanged || !renderedCardDataUrl || !renderedFullPageDataUrl)
      ) {
        const rendered = await renderOfficialStudentCardPdf(pdfBase64);
        if (rendered) {
          renderedCardDataUrl = rendered.croppedDataUrl;
          renderedFullPageDataUrl = rendered.fullPageDataUrl;
        }
      }

      merged = {
        cpf: res.data.cpf ?? cached.payload?.cpf ?? fallbackCpf ?? null,
        ruToken: res.data.ruToken ?? cached.payload?.ruToken ?? null,
        ruValidUntil:
          res.data.ruValidUntil ?? cached.payload?.ruValidUntil ?? null,
        ruCardPdfBase64: pdfBase64,
        renderedCardDataUrl,
        renderedFullPageDataUrl,
        ruBalance: res.data.ruBalance ?? cached.payload?.ruBalance ?? null,
        ruGroup: res.data.ruGroup ?? cached.payload?.ruGroup ?? null,
        ruEntries:
          res.data.ruEntries.length > 0
            ? res.data.ruEntries
            : (cached.payload?.ruEntries ?? []),
      };
    } else if (res.status === 'error') {
      throw new Error(res.error);
    } else {
      throw new Error('Resposta vazia do SIGAA ao consultar a carteirinha.');
    }
  } else {
    merged = {
      cpf: fallbackCpf ?? cached.payload?.cpf ?? '07213537107',
      ruToken: 'UNB-RU-2026-0001',
      ruValidUntil: '2027-03-01',
      ruCardPdfBase64: cached.payload?.ruCardPdfBase64 ?? null,
      renderedCardDataUrl: cached.payload?.renderedCardDataUrl ?? null,
      renderedFullPageDataUrl: cached.payload?.renderedFullPageDataUrl ?? null,
      ruBalance: 24.4,
      ruGroup: 3,
      ruEntries: [
        {
          occurredAt: '13/11/2026 12:15',
          description: 'Consumo Almoço',
          amount: -6.1,
        },
        {
          occurredAt: '12/11/2026 18:10',
          description: 'Consumo Jantar',
          amount: -6.1,
        },
        {
          occurredAt: '10/11/2026 10:00',
          description: 'Recarga GRU / PIX',
          amount: 36.6,
        },
      ],
    };
  }

  await saveCachedStudentWallet(merged);
  return merged;
}
