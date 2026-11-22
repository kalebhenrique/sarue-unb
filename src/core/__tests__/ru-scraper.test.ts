import { describe, expect, it } from 'vitest';
import {
  cleanCellText,
  edgesToBboxes,
  lookupKey,
  mapMealType,
  mapSectionKey,
  parseCampusWeekLinks,
} from '../../scrapers/ru-scraper';

describe('ru-scraper helpers', () => {
  it('normaliza chaves sem acentos e múltiplos espaços', () => {
    expect(lookupKey('  Cardápio   Darcy   Ribeiro  ')).toBe('cardapio darcy ribeiro');
    expect(lookupKey('COMPOSIÇÃO')).toBe('composicao');
  });

  it('identifica refeições em ordem normal e invertida (texto rotacionado)', () => {
    expect(mapMealType('CAFÉ DA MANHÃ')).toBe('breakfast');
    expect(mapMealType('ÃHNAM AD ÉFAC')).toBe('breakfast');
    expect(mapMealType('DESJEJUM')).toBe('breakfast');
    expect(mapMealType('ALMOÇO')).toBe('lunch');
    expect(mapMealType('OÇOMLA')).toBe('lunch');
    expect(mapMealType('JANTAR')).toBe('dinner');
    expect(mapMealType('RATNAJ')).toBe('dinner');
    expect(mapMealType('Outro')).toBeNull();
  });

  it('mapeia seções conhecidas e remove avisos de alergênicos', () => {
    expect(mapSectionKey('Prato Principal Padrão:')).toBe('main_dish');
    expect(mapSectionKey('Prato Vegetariano Estrito')).toBe('vegan_dish');
    expect(mapSectionKey('Bebida (Refresco de)')).toBe('drink');
    expect(cleanCellText('Frango assado (contém glúten)\nArroz branco (Contém soja)')).toBe(
      'Frango assado Arroz branco',
    );
  });

  it('extrai apenas links de PDF do campus selecionado sem vazar para outros h3', () => {
    const html = `
      <h3>Cardápio Darcy Ribeiro</h3>
      <a href="/wp-content/uploads/2026/11/darcy-1.pdf">Semana 16/11/2026 a 22/11/2026</a>
      <a href="/outra-pagina">Aviso</a>
      <h3>Cardápio Gama</h3>
      <a href="https://ru.unb.br/wp-content/uploads/2026/11/gama-1.pdf">Semana 16/11/2026 a 22/11/2026</a>
    `;

    expect(parseCampusWeekLinks(html, 'Darcy Ribeiro')).toEqual([
      {
        url: 'https://ru.unb.br/wp-content/uploads/2026/11/darcy-1.pdf',
        dateRange: ['2026-11-16', '2026-11-22'],
      },
    ]);
    expect(parseCampusWeekLinks(html, 'Gama')).toEqual([
      {
        url: 'https://ru.unb.br/wp-content/uploads/2026/11/gama-1.pdf',
        dateRange: ['2026-11-16', '2026-11-22'],
      },
    ]);
    expect(parseCampusWeekLinks(html, 'Planaltina')).toEqual([]);
  });

  it('reconstrói células da grade a partir de segmentos horizontais e verticais', () => {
    const bboxes = edgesToBboxes(
      [
        { y: 0, x0: 0, x1: 200 },
        { y: 50, x0: 0, x1: 200 },
      ],
      [
        { x: 0, y0: 0, y1: 50 },
        { x: 100, y0: 0, y1: 50 },
        { x: 200, y0: 0, y1: 50 },
      ],
    );

    expect(bboxes).toEqual([
      [0, 0, 100, 50],
      [100, 0, 200, 50],
    ]);
  });
});
