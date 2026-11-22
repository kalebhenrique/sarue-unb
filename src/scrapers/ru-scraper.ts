/**
 * Scraper oficial do Cardápio do Restaurante Universitário (RU) da UnB.
 * Lê https://ru.unb.br/cardapio-refeitorio/, baixa os PDFs semanais de cada campus
 * e gera o JSON estruturado publicado no CDN gh-pages (data/ru-menus.json).
 *
 * Uso:
 *   pnpm run scrape:ru -- --out ./dist-data/ru-menus.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';
import { USER_AGENT, decodeHtmlEntities, fetchWithRetry } from './utils.ts';

export const MENU_INDEX_URL = 'https://ru.unb.br/cardapio-refeitorio/';
export const BASE_URL = 'https://ru.unb.br';
const HEADER_LABEL = 'composicao';
const TOLERANCE = 2.0;
const SNAP_TOLERANCE = 3.0;

export const VALID_CAMPUSES = [
  'Darcy Ribeiro',
  'Ceilândia',
  'Gama',
  'Planaltina',
  'Fazenda Água Limpa',
] as const;

export type RuCampusName = (typeof VALID_CAMPUSES)[number];

export interface RuMenuSection {
  key: string;
  label: string;
  items: string[];
}

export interface RuDailyMenu {
  date: string;
  breakfast: RuMenuSection[];
  lunch: RuMenuSection[];
  dinner: RuMenuSection[];
}

export interface RuMenusPayload {
  updatedAt: string;
  campuses: Record<string, RuDailyMenu[]>;
}

export interface HEdge {
  y: number;
  x0: number;
  x1: number;
}

export interface VEdge {
  x: number;
  y0: number;
  y1: number;
}

export type BBox = [number, number, number, number]; // [x0, top, x1, bottom]

interface TextFragment {
  str: string;
  x: number;
  y: number; // baseline em coordenadas viewport (top-down)
  w: number;
  fontSize: number;
  vertical: boolean;
}

interface Cell {
  x0: number;
  top: number;
  x1: number;
  bottom: number;
  text: string;
}

const SECTION_KEY_MAP: Record<string, string> = {
  bebidas: 'hot_drink',
  bebidasquentes: 'hot_drink',
  panificacao: 'bakery',
  gordura: 'spread',
  complementopadrao: 'breakfast_complement',
  complementoovolactovegetariano: 'ovolacto_complement',
  complementovegetarianoestrito: 'vegan_complement',
  fruta: 'fruit',
  salada1: 'salad_1',
  salada2: 'salad_2',
  molho: 'salad_dressing',
  molhoparasalada: 'salad_dressing',
  pratoprincipalpadrao: 'main_dish',
  pratoovolactovegetariano: 'ovolacto_dish',
  pratoprincipalovolactovegetariano: 'ovolacto_dish',
  ovolactovegetariano: 'ovolacto_dish',
  pratovegetarianoestrito: 'vegan_dish',
  pratoprincipalvegetarianoestrito: 'vegan_dish',
  vegetarianoestrito: 'vegan_dish',
  guarnicao: 'side_dish',
  acompanhamentos: 'accompaniments',
  sobremesa: 'dessert',
  refresco: 'drink',
  'bebida(refrescode)': 'drink',
  sopa: 'soup',
  torrada: 'toast',
  opcaoextra: 'extra',
};

export function lookupKey(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

function sectionLookup(label: string): string {
  return lookupKey(label).replace(/:+$/, '').replace(/[\s-]/g, '');
}

export function mapMealType(label: string): 'breakfast' | 'lunch' | 'dinner' | null {
  const key = lookupKey(label).replace(/\s+/g, '');
  const rev = Array.from(key).reverse().join('');
  const candidates: Array<[string, 'breakfast' | 'lunch' | 'dinner']> = [
    ['cafedamanha', 'breakfast'],
    ['desjejum', 'breakfast'],
    ['almoco', 'lunch'],
    ['jantar', 'dinner'],
  ];
  for (const [needle, meal] of candidates) {
    if (key.includes(needle) || rev.includes(needle)) {
      return meal;
    }
  }
  return null;
}

export function mapSectionKey(label: string): string | null {
  return SECTION_KEY_MAP[sectionLookup(label)] ?? null;
}

export function cleanCellText(raw: string): string {
  if (!raw) return '';
  const withoutContains = raw.replace(/\s*\(\s*cont[eé]m[^)]*\)?/gi, '');
  return withoutContains
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
    .trim();
}

function parseBrDate(text: string): string | null {
  const match = (text || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '));
}

export interface CampusWeekLink {
  url: string;
  dateRange: [string, string] | null; // ISO YYYY-MM-DD
}

export function parseCampusWeekLinks(html: string, campus: string): CampusWeekLink[] {
  const targetHeading = lookupKey(`Cardápio ${campus}`);
  const tokenRe = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let inCampusSection = false;
  const links: CampusWeekLink[] = [];

  for (const match of html.matchAll(tokenRe)) {
    if (match[1] !== undefined) {
      const headingText = stripTags(match[1]);
      if (lookupKey(headingText) === targetHeading) {
        inCampusSection = true;
      } else if (inCampusSection) {
        break;
      }
      continue;
    }

    if (!inCampusSection) continue;
    const href = (match[2] || '').trim();
    if (!href.toLowerCase().endsWith('.pdf')) continue;

    const url = new URL(href, `${BASE_URL}/`).toString();
    const linkText = stripTags(match[3] || '');
    const rangeMatch = linkText.match(
      /(\d{1,2}\/\d{1,2}\/\d{4})\s*a\s*(\d{1,2}\/\d{1,2}\/\d{4})/,
    );
    let dateRange: [string, string] | null = null;
    if (rangeMatch) {
      const start = parseBrDate(rangeMatch[1]);
      const end = parseBrDate(rangeMatch[2]);
      if (start && end && end >= start) {
        dateRange = [start, end];
      }
    }
    links.push({ url, dateRange });
  }

  return links;
}

type Mat6 = [number, number, number, number, number, number];

function mulMat(m1: Mat6, m2: Mat6): Mat6 {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function applyMat(m: Mat6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function isWhiteRgb(rgb: unknown): boolean {
  if (Array.isArray(rgb) && rgb.length >= 3) {
    const [r, g, b] = rgb.map(Number);
    return r > 245 && g > 245 && b > 245;
  }
  if (typeof rgb === 'string') {
    const hex = rgb.trim().toLowerCase();
    return hex === '#ffffff' || hex === '#fff' || hex === 'rgb(255,255,255)';
  }
  return false;
}

function snapAndMergeH(edges: HEdge[]): HEdge[] {
  if (edges.length === 0) return [];
  const sorted = [...edges].sort((a, b) => a.y - b.y);
  const groups: HEdge[][] = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const avgY = last.reduce((s, x) => s + x.y, 0) / last.length;
      if (Math.abs(e.y - avgY) <= SNAP_TOLERANCE) {
        last.push(e);
        continue;
      }
    }
    groups.push([e]);
  }

  const merged: HEdge[] = [];
  for (const g of groups) {
    const y = g.reduce((s, x) => s + x.y, 0) / g.length;
    g.sort((a, b) => a.x0 - b.x0);
    let curX0 = g[0].x0;
    let curX1 = g[0].x1;
    for (let i = 1; i < g.length; i++) {
      const seg = g[i];
      if (seg.x0 <= curX1 + SNAP_TOLERANCE) {
        curX1 = Math.max(curX1, seg.x1);
      } else {
        merged.push({ y, x0: curX0, x1: curX1 });
        curX0 = seg.x0;
        curX1 = seg.x1;
      }
    }
    merged.push({ y, x0: curX0, x1: curX1 });
  }
  return merged;
}

function snapAndMergeV(edges: VEdge[]): VEdge[] {
  if (edges.length === 0) return [];
  const sorted = [...edges].sort((a, b) => a.x - b.x);
  const groups: VEdge[][] = [];
  for (const e of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const avgX = last.reduce((s, x) => s + x.x, 0) / last.length;
      if (Math.abs(e.x - avgX) <= SNAP_TOLERANCE) {
        last.push(e);
        continue;
      }
    }
    groups.push([e]);
  }

  const merged: VEdge[] = [];
  for (const g of groups) {
    const x = g.reduce((s, e) => s + e.x, 0) / g.length;
    g.sort((a, b) => a.y0 - b.y0);
    let curY0 = g[0].y0;
    let curY1 = g[0].y1;
    for (let i = 1; i < g.length; i++) {
      const seg = g[i];
      if (seg.y0 <= curY1 + SNAP_TOLERANCE) {
        curY1 = Math.max(curY1, seg.y1);
      } else {
        merged.push({ x, y0: curY0, y1: curY1 });
        curY0 = seg.y0;
        curY1 = seg.y1;
      }
    }
    merged.push({ x, y0: curY0, y1: curY1 });
  }
  return merged;
}

function hasHSegment(hEdges: HEdge[], y: number, x0: number, x1: number): boolean {
  return hEdges.some(
    (e) =>
      Math.abs(e.y - y) <= SNAP_TOLERANCE &&
      e.x0 <= x0 + SNAP_TOLERANCE &&
      e.x1 >= x1 - SNAP_TOLERANCE,
  );
}

function hasVSegment(vEdges: VEdge[], x: number, y0: number, y1: number): boolean {
  return vEdges.some(
    (e) =>
      Math.abs(e.x - x) <= SNAP_TOLERANCE &&
      e.y0 <= y0 + SNAP_TOLERANCE &&
      e.y1 >= y1 - SNAP_TOLERANCE,
  );
}

export function edgesToBboxes(rawH: HEdge[], rawV: VEdge[]): BBox[] {
  const hEdges = snapAndMergeH(rawH);
  const vEdges = snapAndMergeV(rawV);

  const xsRaw = vEdges.map((v) => v.x).sort((a, b) => a - b);
  const xs: number[] = [];
  for (const x of xsRaw) {
    if (xs.length === 0 || Math.abs(x - xs[xs.length - 1]) > SNAP_TOLERANCE) {
      xs.push(x);
    }
  }

  const ysRaw = hEdges.map((h) => h.y).sort((a, b) => a - b);
  const ys: number[] = [];
  for (const y of ysRaw) {
    if (ys.length === 0 || Math.abs(y - ys[ys.length - 1]) > SNAP_TOLERANCE) {
      ys.push(y);
    }
  }

  const bboxes: BBox[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x0 = xs[i];
    for (let j = 0; j < ys.length; j++) {
      const y0 = ys[j];
      let foundCell = false;
      for (let x1Idx = i + 1; x1Idx < xs.length; x1Idx++) {
        const x1 = xs[x1Idx];
        if (!hasHSegment(hEdges, y0, x0, x1)) break;

        for (let y1Idx = j + 1; y1Idx < ys.length; y1Idx++) {
          const y1 = ys[y1Idx];
          if (!hasVSegment(vEdges, x0, y0, y1)) break;

          if (hasHSegment(hEdges, y1, x0, x1) && hasVSegment(vEdges, x1, y0, y1)) {
            const crossesV = xs
              .slice(i + 1, x1Idx)
              .some((xm) => hasVSegment(vEdges, xm, y0, y1));
            const crossesH = ys
              .slice(j + 1, y1Idx)
              .some((ym) => hasHSegment(hEdges, ym, x0, x1));
            if (!crossesV && !crossesH) {
              bboxes.push([x0, y0, x1, y1]);
              foundCell = true;
              break;
            }
          }
        }
        if (foundCell) break;
      }
    }
  }
  return bboxes;
}

function extractTextInBbox(fragments: TextFragment[], bbox: BBox): string {
  const [x0, top, x1, bottom] = bbox;
  const inside = fragments.filter((f) => {
    const cx = f.vertical ? f.x : f.x + Math.min(f.w * 0.25, 2.0);
    const cy = f.vertical ? f.y : f.y - f.fontSize * 0.35;
    return cx >= x0 - 0.5 && cx <= x1 - 0.5 && cy >= top - 0.5 && cy <= bottom + 0.5;
  });

  if (inside.length === 0) return '';

  const verticalCount = inside.filter((f) => f.vertical).length;
  if (verticalCount * 2 > inside.length) {
    inside.sort((a, b) => {
      if (Math.abs(a.x - b.x) > 3.0) return a.x - b.x;
      return b.y - a.y;
    });
    return cleanCellText(inside.map((f) => f.str).join(''));
  }

  inside.sort((a, b) => a.y - b.y);
  const lines: TextFragment[][] = [];
  for (const frag of inside) {
    const lastLine = lines[lines.length - 1];
    if (lastLine) {
      const avgY = lastLine.reduce((s, f) => s + f.y, 0) / lastLine.length;
      if (Math.abs(frag.y - avgY) <= 3.5) {
        lastLine.push(frag);
        continue;
      }
    }
    lines.push([frag]);
  }

  const lineStrings = lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    let s = '';
    let lastEnd: number | null = null;
    for (const frag of line) {
      if (lastEnd !== null) {
        const gap = frag.x - lastEnd;
        if (gap > frag.fontSize * 0.18 && !s.endsWith(' ') && !frag.str.startsWith(' ')) {
          s += ' ';
        }
      }
      s += frag.str;
      lastEnd = frag.x + frag.w;
    }
    return s;
  });

  return cleanCellText(lineStrings.join('\n'));
}

function spansX(cell: Cell, cx: number): boolean {
  return cx >= cell.x0 - TOLERANCE && cx <= cell.x1 + TOLERANCE;
}

function spansY(cell: Cell, cy: number): boolean {
  return cy >= cell.top - TOLERANCE && cy <= cell.bottom + TOLERANCE;
}

function centerX(cell: Cell): number {
  return (cell.x0 + cell.x1) / 2;
}

function centerY(cell: Cell): number {
  return (cell.top + cell.bottom) / 2;
}

type PathSegmentOp =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number };

function decodeConstructPathOps(
  opsArr: ArrayLike<number>,
  coords: ArrayLike<number>,
  OPS: Record<string, number>,
): PathSegmentOp[] {
  const out: PathSegmentOp[] = [];
  let ci = 0;
  for (let i = 0; i < opsArr.length; i++) {
    const op = opsArr[i];
    if (op === OPS.moveTo) {
      out.push({ type: 'moveTo', x: coords[ci], y: coords[ci + 1] });
      ci += 2;
    } else if (op === OPS.lineTo) {
      out.push({ type: 'lineTo', x: coords[ci], y: coords[ci + 1] });
      ci += 2;
    } else if (op === OPS.rectangle) {
      out.push({
        type: 'rect',
        x: coords[ci],
        y: coords[ci + 1],
        w: coords[ci + 2],
        h: coords[ci + 3],
      });
      ci += 4;
    } else if (op === 15 /* curveTo */) {
      ci += 6;
    } else if (op === 16 || op === 17 /* curveTo2 / curveTo3 */) {
      ci += 4;
    }
  }
  return out;
}

async function extractPageGridEdges(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  viewportTransform: Mat6,
  OPS: Record<string, number>,
): Promise<{ hEdges: HEdge[]; vEdges: VEdge[] }> {
  const opList = await page.getOperatorList();
  const hEdges: HEdge[] = [];
  const vEdges: VEdge[] = [];

  const stack: Array<{ ctm: Mat6; strokeWhite: boolean; fillWhite: boolean }> = [];
  let ctm: Mat6 = [1, 0, 0, 1, 0, 0];
  let strokeWhite = false;
  let fillWhite = false;
  let pendingPath: PathSegmentOp[] = [];

  const flushPath = (isStroke: boolean, isFill: boolean) => {
    const visible = (isStroke && !strokeWhite) || (isFill && !fillWhite);
    if (visible && pendingPath.length > 0) {
      const xform = mulMat(viewportTransform, ctm);
      let cur: [number, number] | null = null;
      for (const seg of pendingPath) {
        if (seg.type === 'moveTo') {
          cur = applyMat(xform, seg.x, seg.y);
        } else if (seg.type === 'lineTo') {
          const [px, py] = applyMat(xform, seg.x, seg.y);
          if (cur) {
            const [x0, y0] = cur;
            if (Math.abs(y0 - py) < 1.0 && Math.abs(x0 - px) > 1.0) {
              hEdges.push({ y: (y0 + py) / 2, x0: Math.min(x0, px), x1: Math.max(x0, px) });
            } else if (Math.abs(x0 - px) < 1.0 && Math.abs(y0 - py) > 1.0) {
              vEdges.push({ x: (x0 + px) / 2, y0: Math.min(y0, py), y1: Math.max(y0, py) });
            }
          }
          cur = [px, py];
        } else if (seg.type === 'rect') {
          const [p0x, p0y] = applyMat(xform, seg.x, seg.y);
          const [p1x, p1y] = applyMat(xform, seg.x + seg.w, seg.y + seg.h);
          const rx0 = Math.min(p0x, p1x);
          const rx1 = Math.max(p0x, p1x);
          const ry0 = Math.min(p0y, p1y);
          const ry1 = Math.max(p0y, p1y);
          if (rx1 - rx0 > 1.0) {
            hEdges.push({ y: ry0, x0: rx0, x1: rx1 });
            hEdges.push({ y: ry1, x0: rx0, x1: rx1 });
          }
          if (ry1 - ry0 > 1.0) {
            vEdges.push({ x: rx0, y0: ry0, y1: ry1 });
            vEdges.push({ x: rx1, y0: ry0, y1: ry1 });
          }
        }
      }
    }
    pendingPath = [];
  };

  const fnArray: number[] = opList.fnArray;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const argsArray: any[] = opList.argsArray;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === OPS.save) {
      stack.push({ ctm: [...ctm], strokeWhite, fillWhite });
    } else if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) {
        ctm = prev.ctm;
        strokeWhite = prev.strokeWhite;
        fillWhite = prev.fillWhite;
      }
      pendingPath = [];
    } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
      ctm = mulMat(ctm, args as Mat6);
    } else if (fn === OPS.setStrokeRGBColor && args) {
      strokeWhite = isWhiteRgb(args);
    } else if (fn === OPS.setFillRGBColor && args) {
      fillWhite = isWhiteRgb(args);
    } else if (fn === OPS.setStrokeGray && args) {
      strokeWhite = Number(args[0]) > 0.96;
    } else if (fn === OPS.setFillGray && args) {
      fillWhite = Number(args[0]) > 0.96;
    } else if (fn === OPS.constructPath && Array.isArray(args)) {
      // No pdfjs-dist v5, constructPath recebe [paintOp, [coords...], minMax] OU [opsArr, coordsArr, minMax]
      if (typeof args[0] === 'number') {
        const paintOp = args[0];
        const data = args[1]?.[0] ?? args[1] ?? [];
        // Fallback: caso pdfjs já envie ops no array interno
        // Formato pdfjs-dist v5: args = [paintOp, [Float32Array], minMax]
        // onde os sub-ops no Float32Array são DrawOPS: 0=moveTo, 1=lineTo, 2=curveTo, 3=quadCurve, 4=closePath
        if (data && typeof data.length === 'number') {
          const parsed: PathSegmentOp[] = [];
          let idx = 0;
          let subStart: [number, number] | null = null;
          let subCur: [number, number] | null = null;
          while (idx < data.length) {
            const subOp = data[idx++];
            if (subOp === 0 /* DrawOPS.moveTo */) {
              const x = data[idx++];
              const y = data[idx++];
              subStart = [x, y];
              subCur = [x, y];
              parsed.push({ type: 'moveTo', x, y });
            } else if (subOp === 1 /* DrawOPS.lineTo */) {
              const x = data[idx++];
              const y = data[idx++];
              subCur = [x, y];
              parsed.push({ type: 'lineTo', x, y });
            } else if (subOp === 2 /* DrawOPS.curveTo */) {
              const x = data[idx + 4];
              const y = data[idx + 5];
              subCur = [x, y];
              idx += 6;
            } else if (subOp === 3 /* DrawOPS.quadraticCurveTo */) {
              const x = data[idx + 2];
              const y = data[idx + 3];
              subCur = [x, y];
              idx += 4;
            } else if (subOp === 4 /* DrawOPS.closePath */) {
              if (subStart && subCur) {
                parsed.push({ type: 'lineTo', x: subStart[0], y: subStart[1] });
                subCur = subStart;
              }
            } else {
              break;
            }
          }
          pendingPath.push(...parsed);
        }
        if (
          paintOp === OPS.stroke ||
          paintOp === OPS.closeStroke ||
          paintOp === OPS.fill ||
          paintOp === OPS.eoFill ||
          paintOp === OPS.fillStroke ||
          paintOp === OPS.eoFillStroke ||
          paintOp === OPS.closeFillStroke ||
          paintOp === OPS.closeEOFillStroke
        ) {
          const isStroke =
            paintOp === OPS.stroke ||
            paintOp === OPS.closeStroke ||
            paintOp === OPS.fillStroke ||
            paintOp === OPS.eoFillStroke ||
            paintOp === OPS.closeFillStroke ||
            paintOp === OPS.closeEOFillStroke;
          const isFill =
            paintOp === OPS.fill ||
            paintOp === OPS.eoFill ||
            paintOp === OPS.fillStroke ||
            paintOp === OPS.eoFillStroke ||
            paintOp === OPS.closeFillStroke ||
            paintOp === OPS.closeEOFillStroke;
          flushPath(isStroke, isFill);
        }
      } else if (Array.isArray(args[0]) && args[1]) {
        pendingPath.push(...decodeConstructPathOps(args[0], args[1], OPS));
      }
    } else if (fn === OPS.moveTo && args) {
      pendingPath.push({ type: 'moveTo', x: args[0], y: args[1] });
    } else if (fn === OPS.lineTo && args) {
      pendingPath.push({ type: 'lineTo', x: args[0], y: args[1] });
    } else if (fn === OPS.rectangle && args) {
      pendingPath.push({ type: 'rect', x: args[0], y: args[1], w: args[2], h: args[3] });
    } else if (fn === OPS.stroke || fn === OPS.closeStroke) {
      flushPath(true, false);
    } else if (fn === OPS.fill || fn === OPS.eoFill) {
      flushPath(false, true);
    } else if (
      fn === OPS.fillStroke ||
      fn === OPS.eoFillStroke ||
      fn === OPS.closeFillStroke ||
      fn === OPS.closeEOFillStroke
    ) {
      flushPath(true, true);
    } else if (fn === OPS.endPath) {
      pendingPath = [];
    }
  }

  return { hEdges, vEdges };
}

export async function parseRuMenuPdf(pdfBytes: Uint8Array): Promise<RuDailyMenu[]> {
  const { OPS } = await getResolvedPDFJS();
  const pdf = await getDocumentProxy(pdfBytes);

  const daysMap = new Map<
    string,
    { breakfast: RuMenuSection[]; lunch: RuMenuSection[]; dinner: RuMenuSection[] }
  >();

  try {
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const vt = viewport.transform as Mat6;

      const { hEdges, vEdges } = await extractPageGridEdges(page, vt, OPS);
      const bboxes = edgesToBboxes(hEdges, vEdges);
      if (bboxes.length === 0) {
        throw new Error(`Nenhuma célula de tabela encontrada na página ${pageNum} do PDF.`);
      }

      const textContent = await page.getTextContent();
      const fragments: TextFragment[] = [];
      for (const item of textContent.items) {
        if (!('str' in item) || !item.str) continue;
        const t = item.transform as number[];
        const tx = mulMat(vt, [t[0], t[1], t[2], t[3], t[4], t[5]]);
        const vertical = Math.abs(t[1]) > Math.abs(t[0]) * 1.5;
        const fontSize = Math.max(Math.hypot(t[0], t[1]), Math.hypot(t[2], t[3]), 1);
        fragments.push({
          str: item.str,
          x: tx[4],
          y: tx[5],
          w: item.width || 0,
          fontSize,
          vertical,
        });
      }

      const cells: Cell[] = [];
      for (const bbox of bboxes) {
        const text = extractTextInBbox(fragments, bbox);
        if (text) {
          cells.push({
            x0: bbox[0],
            top: bbox[1],
            x1: bbox[2],
            bottom: bbox[3],
            text,
          });
        }
      }

      const header = cells.find((c) => lookupKey(c.text) === HEADER_LABEL);
      if (!header) {
        throw new Error('Cabeçalho `COMPOSIÇÃO` não encontrado no PDF do cardápio.');
      }

      const mealText = cells
        .filter((c) => c.x1 <= header.x0 + TOLERANCE)
        .map((c) => c.text)
        .join('');
      const mealType = mapMealType(mealText);
      if (!mealType) {
        throw new Error(`Refeição \`${mealText}\` desconhecida no PDF do cardápio.`);
      }

      const dayCols: Array<{ date: string; cell: Cell }> = [];
      for (const c of cells) {
        if (c.top > header.bottom + TOLERANCE) continue;
        const parsedDate = parseBrDate(c.text);
        if (parsedDate) {
          dayCols.push({ date: parsedDate, cell: c });
        }
      }
      dayCols.sort((a, b) => a.cell.x0 - b.cell.x0);
      if (dayCols.length === 0) {
        throw new Error('Nenhuma coluna de data encontrada no PDF do cardápio.');
      }

      const bodyTop = dayCols.reduce(
        (acc, d) => Math.max(acc, d.cell.bottom),
        header.bottom,
      );
      const bodyCells = cells.filter((c) => c.top >= bodyTop - TOLERANCE);

      const labels = bodyCells
        .filter((c) => spansX(header, centerX(c)))
        .sort((a, b) => a.top - b.top || a.x0 - b.x0);

      const values = bodyCells
        .filter((c) => c.x0 >= header.x1 - TOLERANCE)
        .sort((a, b) => a.top - b.top || a.x0 - b.x0);

      const itemsByDaySection = new Map<string, string[]>();
      for (const val of values) {
        const labelIdx = labels.findIndex((l) => spansY(l, centerY(val)));
        if (labelIdx === -1) {
          throw new Error(`Item \`${val.text}\` sem seção correspondente no PDF do cardápio.`);
        }
        const matchedDays = dayCols
          .filter((d) => spansX({ ...val, text: '' }, centerX(d.cell)))
          .map((d) => d.date);
        if (matchedDays.length === 0) {
          throw new Error(`Item \`${val.text}\` sem dia correspondente no PDF do cardápio.`);
        }
        for (const day of matchedDays) {
          const mapKey = `${day}|${labelIdx}`;
          const list = itemsByDaySection.get(mapKey) ?? [];
          if (!list.includes(val.text)) {
            list.push(val.text);
          }
          itemsByDaySection.set(mapKey, list);
        }
      }

      const sectionsMeta = labels.map((lbl, idx) => {
        const key = mapSectionKey(lbl.text);
        if (!key) {
          throw new Error(`Seção \`${lbl.text}\` desconhecida no PDF do cardápio.`);
        }
        const cleanLabel = lbl.text.replace(/:+$/, '').trim();
        return { idx, key, cleanLabel };
      });

      const seenDays = new Set<string>();
      for (const { date } of dayCols) {
        if (seenDays.has(date)) continue;
        seenDays.add(date);

        const mealSections: RuMenuSection[] = [];
        for (const { idx, key, cleanLabel } of sectionsMeta) {
          const items = itemsByDaySection.get(`${date}|${idx}`);
          if (items && items.length > 0) {
            mealSections.push({ key, label: cleanLabel, items });
          }
        }

        const dayEntry = daysMap.get(date) ?? {
          breakfast: [],
          lunch: [],
          dinner: [],
        };
        dayEntry[mealType] = mealSections;
        daysMap.set(date, dayEntry);
      }
    }
  } finally {
    await pdf.cleanup();
  }

  return Array.from(daysMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, meals]) => ({
      date,
      breakfast: meals.breakfast,
      lunch: meals.lunch,
      dinner: meals.dinner,
    }));
}

function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export async function scrapeAllCampuses(): Promise<RuMenusPayload> {
  const indexRes = await fetchWithRetry(MENU_INDEX_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });
  const indexHtml = await indexRes.text();

  const campusesData: Record<string, RuDailyMenu[]> = {};

  for (const campus of VALID_CAMPUSES) {
    const links = parseCampusWeekLinks(indexHtml, campus);
    const byDate = new Map<string, RuDailyMenu>();

    for (const { url, dateRange } of links.slice(0, 3)) {
      try {
        const pdfRes = await fetchWithRetry(url, {
          headers: { 'User-Agent': USER_AGENT },
        });
        const buffer = new Uint8Array(await pdfRes.arrayBuffer());
        const parsed = await parseRuMenuPdf(buffer);
        const parsedDates = new Set<string>();
        for (const menu of parsed) {
          parsedDates.add(menu.date);
          byDate.set(menu.date, menu);
        }

        if (dateRange) {
          const [start, end] = dateRange;
          let cur = start;
          while (cur <= end) {
            if (!parsedDates.has(cur) && !byDate.has(cur)) {
              byDate.set(cur, {
                date: cur,
                breakfast: [],
                lunch: [],
                dinner: [],
              });
            }
            cur = addDaysIso(cur, 1);
          }
        }
      } catch (err) {
        console.warn(`[RuScraper] Falha ao processar ${campus} (${url}):`, err);
      }
    }

    campusesData[campus] = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    console.log(`[RuScraper] ${campus}: ${campusesData[campus].length} dia(s) coletado(s).`);
  }

  return {
    updatedAt: new Date().toISOString(),
    campuses: campusesData,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outPath = path.resolve(
    outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : './dist-data/ru-menus.json',
  );

  const payload = await scrapeAllCampuses();
  const totalDays = Object.values(payload.campuses).reduce(
    (sum, days) => sum + days.length,
    0,
  );
  if (totalDays === 0) {
    throw new Error('Nenhum dia de cardápio coletado.');
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
  console.log(`[RuScraper] Gravado em ${outPath} (${totalDays} dias no total).`);
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((err) => {
    console.error('[RuScraper] Erro fatal:', err);
    process.exit(1);
  });
}
