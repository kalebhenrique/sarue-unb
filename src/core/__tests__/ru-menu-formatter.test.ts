import { describe, it, expect } from 'vitest';
import {
  splitAlternatives,
  splitJoinedAccompaniments,
  formatRefreshmentItem,
  formatSaladDressingBadge,
  getBrasiliaDateParts,
  getBrasiliaTodayIso,
  resolveInitialMealAndDate,
  formatMealMenu,
  type RawRuMenuSection,
} from '@/core';

describe('RU Menu Formatter & Sanitizer', () => {
  describe('splitAlternatives', () => {
    it('deve quebrar alternativas com OU maiúsculo ou minúsculo e capitalizar', () => {
      expect(splitAlternatives('Leite integral  OU Bebida de soja')).toEqual([
        'Leite integral',
        'Bebida de soja',
      ]);
      expect(
        splitAlternatives('Pão francês  ou Pão careca  ou Pão integral')
      ).toEqual(['Pão francês', 'Pão careca', 'Pão integral']);
      expect(splitAlternatives('Manteiga  ou creme vegetal')).toEqual([
        'Manteiga',
        'Creme vegetal',
      ]);
    });
  });

  describe('splitJoinedAccompaniments', () => {
    it('deve separar acompanhamentos aglutinados em itens distintos', () => {
      expect(
        splitJoinedAccompaniments('Arroz branco e integral Feijão preto')
      ).toEqual(['Arroz branco e integral', 'Feijão preto']);
      expect(
        splitJoinedAccompaniments('Arroz branco e integral Feijão carioca Farofa')
      ).toEqual(['Arroz branco e integral', 'Feijão carioca', 'Farofa']);
    });
  });

  describe('normalização de labels técnicas', () => {
    it('deve normalizar refresco para "Refresco de <sabor>"', () => {
      expect(formatRefreshmentItem('Acerola')).toBe('Refresco de acerola');
      expect(formatRefreshmentItem('Refresco de caju')).toBe('Refresco de caju');
    });

    it('deve normalizar molho de salada para badge "Molho <tipo>"', () => {
      expect(formatSaladDressingBadge('Ácido')).toBe('Molho ácido');
      expect(formatSaladDressingBadge('Molho campanha')).toBe('Molho campanha');
    });
  });

  describe('resolveInitialMealAndDate', () => {
    it('deve selecionar Desjejum antes das 9h30', () => {
      const res = resolveInitialMealAndDate(new Date(2026, 10, 14, 8, 15));
      expect(res.meal).toBe('breakfast');
      expect(res.targetDateIso).toBe('2026-11-14');
      expect(res.advancedToNextDay).toBe(false);
    });

    it('deve selecionar Almoço após 9h30 até 14h29', () => {
      const res = resolveInitialMealAndDate(new Date(2026, 10, 14, 9, 30));
      expect(res.meal).toBe('lunch');
      expect(res.targetDateIso).toBe('2026-11-14');
    });

    it('deve selecionar Jantar após 14h30 até 19h59', () => {
      const res = resolveInitialMealAndDate(new Date(2026, 10, 14, 14, 30));
      expect(res.meal).toBe('dinner');
      expect(res.targetDateIso).toBe('2026-11-14');
    });

    it('deve avançar para o Desjejum do dia seguinte após 20h', () => {
      const res = resolveInitialMealAndDate(new Date(2026, 10, 14, 20, 5));
      expect(res.meal).toBe('breakfast');
      expect(res.targetDateIso).toBe('2026-11-15');
      expect(res.advancedToNextDay).toBe(true);
    });

    it('deve manter a data de Brasília às 21h05 BRT mesmo quando UTC já virou para domingo', () => {
      const utcSundayMidnightPlus = new Date('2026-11-15T00:05:00.000Z');
      expect(getBrasiliaTodayIso(utcSundayMidnightPlus)).toBe('2026-11-14');
      expect(getBrasiliaDateParts(utcSundayMidnightPlus)).toMatchObject({
        year: 2026,
        month: 11,
        day: 14,
        hour: 21,
        minute: 5,
      });
    });
  });

  describe('formatMealMenu', () => {
    it('deve unificar Saladas + Molho, separar Acompanhamentos, agrupar Gordura em Panificação e formatar Bebida', () => {
      const lunchSections: RawRuMenuSection[] = [
        { key: 'salad_1', label: 'Salada 1', items: ['Alface lisa'] },
        { key: 'salad_2', label: 'Salada 2', items: ['Pepino agridoce'] },
        { key: 'salad_dressing', label: 'Molho para salada', items: ['Ácido'] },
        {
          key: 'main_dish',
          label: 'Prato principal padrão',
          items: ['Frango assado com azeitonas'],
        },
        {
          key: 'ovolacto_dish',
          label: 'Opção ovolactovegetariana',
          items: ['Fricassê de grão-de-bico'],
        },
        {
          key: 'vegan_dish',
          label: 'Opção vegetariana estrita',
          items: ['Fricassê vegano de grão-de-bico'],
        },
        {
          key: 'accompaniments',
          label: 'Acompanhamentos',
          items: ['Arroz branco e integral Feijão preto'],
        },
        { key: 'drink', label: 'Bebida (refresco de)', items: ['Acerola'] },
      ];

      const formatted = formatMealMenu('lunch', lunchSections);
      expect(formatted.title).toBe('Almoço');
      expect(formatted.hoursLabel).toBe('11h - 14h30');
      expect(formatted.variations).toHaveLength(3);

      const salads = formatted.composition.find((g) => g.id === 'salads');
      expect(salads).toBeDefined();
      expect(salads?.label).toBe('Saladas');
      expect(salads?.items).toEqual([['Alface lisa'], ['Pepino agridoce']]);
      expect(salads?.subGroup?.chips).toEqual(['Molho ácido']);

      const accomp = formatted.composition.find((g) => g.id === 'accompaniments');
      expect(accomp?.items).toEqual([['Arroz branco e integral'], ['Feijão preto']]);

      const drink = formatted.composition.find((g) => g.id === 'drink');
      expect(drink?.label).toBe('Bebida');
      expect(drink?.items).toEqual([['Refresco de acerola']]);
    });

    it('deve agrupar "Gordura" como "Complemento de panificação" dentro do card de Panificação no Desjejum', () => {
      const breakfastSections: RawRuMenuSection[] = [
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
      ];

      const formatted = formatMealMenu('breakfast', breakfastSections);
      const bakery = formatted.composition.find((g) => g.id === 'bakery');
      expect(bakery).toBeDefined();
      expect(bakery?.label).toBe('Panificação');
      expect(bakery?.items).toEqual([
        ['Pão francês', 'Pão careca', 'Pão integral'],
      ]);
      expect(bakery?.subGroup).toEqual({
        label: 'Complemento de panificação',
        chips: ['Manteiga', 'Creme vegetal'],
      });
    });
  });
});
