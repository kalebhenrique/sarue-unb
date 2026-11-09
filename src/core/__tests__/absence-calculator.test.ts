import { describe, it, expect } from 'vitest';
import {
  parseCreditsFromSchedule,
  calculateMaxAbsences,
  parseHoursPerClass,
  calculateAbsenceRisk,
  convertSigaaHoursToClassAbsences,
} from '../domain/utils/absence-calculator';

describe('Absence Calculator - Regras de Faltas UnB (25% em dias/aulas de aula)', () => {
  describe('parseCreditsFromSchedule & calculateMaxAbsences - Cálculo de créditos e limite UnB', () => {
    it('calcula créditos e faltas para CÁLCULO 3 (235M34 -> 6 créditos, 2h/aula -> 11 faltas)', () => {
      const credits = parseCreditsFromSchedule('235M34 (10/08/2026 - 14/12/2026)');
      expect(credits).toBe(6);
      expect(calculateMaxAbsences(credits, 2)).toBe(11);
    });

    it('calcula créditos e faltas para INTRODUÇÃO AOS CIRCUITOS ELÉTRICOS (6M34 -> 2 créditos, 2h/aula -> 3 faltas)', () => {
      const credits = parseCreditsFromSchedule('6M34');
      expect(credits).toBe(2);
      expect(calculateMaxAbsences(credits, 2)).toBe(3);
    });

    it('calcula créditos e faltas para ORGANIZAÇÃO INDUSTRIAL em bloco de 4h (4M1234 -> 4 créditos, 4h/aula -> 3 faltas)', () => {
      const credits = parseCreditsFromSchedule('4M1234 (10/08/2026 - 14/12/2026)');
      expect(credits).toBe(4);
      expect(calculateMaxAbsences(credits, 4)).toBe(3);
    });

    it('calcula créditos para múltiplos blocos (ex: 24M34 6M12 -> 4 + 2 = 6 créditos, 2h/aula -> 11 faltas)', () => {
      const credits = parseCreditsFromSchedule('24M34 6M12');
      expect(credits).toBe(6);
      expect(calculateMaxAbsences(credits, 2)).toBe(11);
    });

    it('adota 4 créditos como padrão quando horário não puder ser parseado', () => {
      expect(parseCreditsFromSchedule('')).toBe(4);
      expect(parseCreditsFromSchedule(null)).toBe(4);
      expect(calculateMaxAbsences(4, 2)).toBe(7);
    });
  });

  describe('convertSigaaHoursToClassAbsences - Conversão de horas-falta SIGAA para dias/aulas', () => {
    it('converte 22 horas-falta do SIGAA em 11 faltas para aula de 2h', () => {
      expect(convertSigaaHoursToClassAbsences(22, '35T45')).toBe(11);
    });

    it('converte 4 horas-falta do SIGAA em 1 falta para aula de 4h (4M1234)', () => {
      expect(convertSigaaHoursToClassAbsences(4, '4M1234')).toBe(1);
    });

    it('retorna 0 para 0 horas-falta', () => {
      expect(convertSigaaHoursToClassAbsences(0, '35T45')).toBe(0);
    });

    it('retorna undefined para entradas nulas ou indefinidas', () => {
      expect(convertSigaaHoursToClassAbsences(null, '35T45')).toBeUndefined();
      expect(convertSigaaHoursToClassAbsences(undefined, '35T45')).toBeUndefined();
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
      expect(result.safeClassesToMiss).toBe(7); // Pode faltar 7 aulas
      expect(result.classesUntilReproval).toBe(8); // Se faltar a 8ª aula, reprova
      expect(result.isAtRisk).toBe(false);
      expect(result.isCritical).toBe(false);
      expect(result.isExceeded).toBe(false);
    });

    it('calcula corretamente para EPR0068 (4 créditos, 4M1234 -> máx 3) com 2 faltas', () => {
      const result = calculateAbsenceRisk({
        absences: 2,
        schedule: '4M1234',
      });

      expect(result.absences).toBe(2);
      expect(result.maxAbsences).toBe(3);
      expect(result.hoursPerClass).toBe(4);
      expect(result.remainingAbsences).toBe(1);
      expect(result.safeClassesToMiss).toBe(1); // Pode faltar mais 1 aula de 4h
      expect(result.classesUntilReproval).toBe(2); // Se faltar mais 2 aulas, reprova
      expect(result.isCritical).toBe(false);
      expect(result.isAtRisk).toBe(true);
      expect(result.isExceeded).toBe(false);
    });

    it('identifica alerta crítico quando restam apenas 1 aula para reprovação em 6 créditos (max 11, faltas = 10)', () => {
      const result = calculateAbsenceRisk({
        absences: 10,
        schedule: '235M34',
      });

      expect(result.maxAbsences).toBe(11);
      expect(result.remainingAbsences).toBe(1);
      expect(result.safeClassesToMiss).toBe(1);
      expect(result.classesUntilReproval).toBe(2);
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
      expect(result.warningMessage).toContain('Resta apenas 1 aula');
    });

    it('identifica limite excedido quando aluno tem 11 faltas em disciplina de máx 7', () => {
      const result = calculateAbsenceRisk({
        absences: 11,
        schedule: '35T45',
      });

      expect(result.absences).toBe(11);
      expect(result.maxAbsences).toBe(7);
      expect(result.isExceeded).toBe(true);
      expect(result.isAtRisk).toBe(true);
      expect(result.isCritical).toBe(true);
      expect(result.classesUntilReproval).toBe(0);
      expect(result.safeClassesToMiss).toBe(0);
      expect(result.warningMessage).toContain('Limite de 25% excedido (11/7 faltas)');
    });
  });
});
