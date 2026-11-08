import { describe, it, expect } from 'vitest';
import {
  parseCreditsFromSchedule,
  calculateMaxAbsences,
  parseHoursPerClass,
  calculateAbsenceRisk,
} from '../domain/utils/absence-calculator';

describe('Absence Calculator - Regras de Faltas UnB (créditos * 2 - 1)', () => {
  describe('parseCreditsFromSchedule & calculateMaxAbsences - Cálculo de créditos e limite UnB', () => {
    it('calcula créditos e faltas para CÁLCULO 3 (235M34 -> 6 créditos -> 11 faltas)', () => {
      const credits = parseCreditsFromSchedule('235M34 (10/08/2026 - 14/12/2026)');
      expect(credits).toBe(6);
      expect(calculateMaxAbsences(credits)).toBe(11);
    });

    it('calcula créditos e faltas para INTRODUÇÃO AOS CIRCUITOS ELÉTRICOS (6M34 -> 2 créditos -> 3 faltas)', () => {
      const credits = parseCreditsFromSchedule('6M34');
      expect(credits).toBe(2);
      expect(calculateMaxAbsences(credits)).toBe(3);
    });

    it('calcula créditos e faltas para ORGANIZAÇÃO INDUSTRIAL (4M1234 -> 4 créditos -> 7 faltas)', () => {
      const credits = parseCreditsFromSchedule('4M1234 (10/08/2026 - 14/12/2026)');
      expect(credits).toBe(4);
      expect(calculateMaxAbsences(credits)).toBe(7);
    });

    it('calcula créditos para múltiplos blocos (ex: 24M34 6M12 -> 4 + 2 = 6 créditos -> 11 faltas)', () => {
      const credits = parseCreditsFromSchedule('24M34 6M12');
      expect(credits).toBe(6);
      expect(calculateMaxAbsences(credits)).toBe(11);
    });

    it('adota 4 créditos como padrão quando horário não puder ser parseado', () => {
      expect(parseCreditsFromSchedule('')).toBe(4);
      expect(parseCreditsFromSchedule(null)).toBe(4);
      expect(calculateMaxAbsences(4)).toBe(7);
    });
  });

  describe('parseHoursPerClass - Identificação de duração da aula (1, 2 ou 4 horas)', () => {
    it('identifica aula dupla (2 horas) em código 35T45', () => {
      expect(parseHoursPerClass('35T45')).toBe(2);
      expect(parseHoursPerClass('35T45 (10/08/2026 - 14/12/2026)')).toBe(2);
    });

    it('identifica aula dupla (2 horas) em código 24M34', () => {
      expect(parseHoursPerClass('24M34')).toBe(2);
    });

    it('identifica aula dupla (2 horas) em código 246N12', () => {
      expect(parseHoursPerClass('246N12')).toBe(2);
    });

    it('identifica aula quádrupla (4 horas) em bloco de 4 períodos como 4M1234', () => {
      expect(parseHoursPerClass('4M1234')).toBe(4);
      expect(parseHoursPerClass('2T1234 (10/08/2026 - 14/12/2026)')).toBe(4);
    });

    it('identifica aula simples (1 hora) em código de 1 período como 6T1', () => {
      expect(parseHoursPerClass('6T1')).toBe(1);
      expect(parseHoursPerClass('2M1')).toBe(1);
    });

    it('retorna 2 como padrão para horários sem padrão ou vazios', () => {
      expect(parseHoursPerClass('')).toBe(2);
      expect(parseHoursPerClass(null)).toBe(2);
      expect(parseHoursPerClass(undefined)).toBe(2);
      expect(parseHoursPerClass('A combinar com o professor')).toBe(2);
    });
  });

  describe('calculateAbsenceRisk - Estimativa de aulas até reprovação', () => {
    it('calcula corretamente para aluno com 0 faltas em aula dupla (2h, 4 créditos -> máx 7)', () => {
      const result = calculateAbsenceRisk({
        absences: 0,
        schedule: '35T45',
      });

      expect(result.absences).toBe(0);
      expect(result.maxAbsences).toBe(7);
      expect(result.hoursPerClass).toBe(2);
      expect(result.remainingAbsences).toBe(7);
      expect(result.safeClassesToMiss).toBe(3); // 3 * 2 = 6 faltas permitidas
      expect(result.classesUntilReproval).toBe(4); // Se faltar 4 aulas (8h), reprova
      expect(result.isAtRisk).toBe(false);
      expect(result.isCritical).toBe(false);
      expect(result.isExceeded).toBe(false);
    });

    it('calcula corretamente para EPR0068 (4 créditos, 4M1234 -> máx 7) com 4 faltas', () => {
      const result = calculateAbsenceRisk({
        absences: 4,
        schedule: '4M1234',
      });

      expect(result.absences).toBe(4);
      expect(result.maxAbsences).toBe(7);
      expect(result.hoursPerClass).toBe(4);
      expect(result.remainingAbsences).toBe(3);
      expect(result.safeClassesToMiss).toBe(0); // Não pode faltar mais nenhuma aula de 4h
      expect(result.classesUntilReproval).toBe(1); // Mais 1 falta de 4h (4 + 4 = 8 > 7) leva à reprovação
      expect(result.isCritical).toBe(true);
      expect(result.isAtRisk).toBe(true);
      expect(result.isExceeded).toBe(false);
    });

    it('identifica alerta moderado quando restam 2 aulas para reprovação em 6 créditos (max 11)', () => {
      const result = calculateAbsenceRisk({
        absences: 8,
        schedule: '235M34',
      });

      expect(result.maxAbsences).toBe(11);
      expect(result.remainingAbsences).toBe(3);
      expect(result.safeClassesToMiss).toBe(1); // Pode faltar 1 aula (+2 = 10 <= 11)
      expect(result.classesUntilReproval).toBe(2); // Se faltar 2 aulas (+4 = 12 > 11), reprova
      expect(result.isAtRisk).toBe(true);
      expect(result.isCritical).toBe(false);
      expect(result.isExceeded).toBe(false);
      expect(result.warningMessage).toContain('Restam apenas 2 aulas');
    });

    it('identifica alerta crítico quando o aluno já atingiu exatamente o limite (7/7)', () => {
      const result = calculateAbsenceRisk({
        absences: 7,
        schedule: '35T45',
      });

      expect(result.remainingAbsences).toBe(0);
      expect(result.safeClassesToMiss).toBe(0);
      expect(result.classesUntilReproval).toBe(1); // Mais 1 aula e reprova
      expect(result.isAtRisk).toBe(true);
      expect(result.isCritical).toBe(true);
      expect(result.isExceeded).toBe(false);
    });

    it('identifica limite excedido (reprovado por faltas)', () => {
      const result = calculateAbsenceRisk({
        absences: 8,
        schedule: '35T45',
      });

      expect(result.isExceeded).toBe(true);
      expect(result.isAtRisk).toBe(true);
      expect(result.isCritical).toBe(true);
      expect(result.classesUntilReproval).toBe(0);
      expect(result.safeClassesToMiss).toBe(0);
      expect(result.warningMessage).toContain('Limite de 25% excedido');
    });
  });
});
