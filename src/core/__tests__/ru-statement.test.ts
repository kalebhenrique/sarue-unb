import { describe, expect, it } from 'vitest';
import {
  cleanRuStatement,
  cleanRuStatementEntry,
  formatRuStatementDate,
} from '@/core';

describe('formatRuStatementDate', () => {
  it('compacta "dd/MM/yyyy HH:mm" para "dd/MM • HH:mm"', () => {
    expect(formatRuStatementDate('24/11/2026 20:23')).toBe('24/11 • 20:23');
    expect(formatRuStatementDate('19/11/2026 17:34')).toBe('19/11 • 17:34');
  });

  it('cai para o valor bruto quando não parseia', () => {
    expect(formatRuStatementDate('data estranha')).toBe('data estranha');
    expect(formatRuStatementDate('')).toBe('');
  });
});

describe('cleanRuStatementEntry', () => {
  it('filtra linhas de controle contábil ("Saldo" / "Saldo Anterior")', () => {
    expect(cleanRuStatementEntry({ occurredAt: '24/11/2026 20:23', description: 'Saldo', amount: 0 })).toBeNull();
    expect(
      cleanRuStatementEntry({ occurredAt: '17/11/2026 20:23', description: 'Saldo Anterior', amount: 12.2 }),
    ).toBeNull();
  });

  it('remove o prefixo redundante "Grupo X " da descrição', () => {
    const clean = cleanRuStatementEntry({
      occurredAt: '24/11/2026 11:49',
      description: 'Grupo 1 Almoço',
      amount: 0,
    });
    expect(clean?.description).toBe('Almoço');
    expect(clean?.kind).toBe('meal');
    expect(clean?.isExempt).toBe(true);
  });

  it('classifica valor positivo como recarga/crédito, não isento', () => {
    const clean = cleanRuStatementEntry({
      occurredAt: '20/11/2026 09:00',
      description: 'Grupo 2 Recarga',
      amount: 20,
    });
    expect(clean?.kind).toBe('credit');
    expect(clean?.isExempt).toBe(false);
  });

  it('refeição paga (valor > 0 com texto de refeição) é saída, não crédito', () => {
    const clean = cleanRuStatementEntry({
      occurredAt: '20/11/2026 12:00',
      description: 'Grupo 3 Almoço',
      amount: 6.1,
    });
    expect(clean?.kind).toBe('meal');
    expect(clean?.isExempt).toBe(false);
    expect(clean?.description).toBe('Almoço');
  });

  it('mantém refeição com amount null como refeição não isenta', () => {
    const clean = cleanRuStatementEntry({
      occurredAt: '20/11/2026 12:00',
      description: 'Grupo 2 Jantar',
      amount: null,
    });
    expect(clean?.kind).toBe('meal');
    expect(clean?.isExempt).toBe(false);
  });

  it('descarta entrada vazia ou sem descrição', () => {
    expect(cleanRuStatementEntry({ occurredAt: '', description: '   ', amount: 0 })).toBeNull();
    expect(
      cleanRuStatementEntry({ occurredAt: '01/01/2026 10:00', description: 'Grupo 5 ', amount: 0 }),
    ).toBeNull();
  });
});

describe('cleanRuStatement', () => {
  it('limpa o extrato real do SIGAA: remove Saldo/Saldo Anterior e prefixos de grupo', () => {
    const cleaned = cleanRuStatement([
      { occurredAt: '24/11/2026 20:23', description: 'Saldo', amount: 0 },
      { occurredAt: '24/11/2026 11:49', description: 'Grupo 1 Almoço', amount: 0 },
      { occurredAt: '19/11/2026 17:34', description: 'Grupo 1 Jantar', amount: 0 },
      { occurredAt: '17/11/2026 20:23', description: 'Saldo Anterior', amount: 12.2 },
    ]);

    expect(cleaned).toHaveLength(2);
    expect(cleaned[0].description).toBe('Almoço');
    expect(cleaned[0].occurredAtShort).toBe('24/11 • 11:49');
    expect(cleaned[0].isExempt).toBe(true);
    expect(cleaned[1].description).toBe('Jantar');
    expect(cleaned[1].occurredAtShort).toBe('19/11 • 17:34');
  });

  it('retorna lista vazia para entrada não-array', () => {
    expect(cleanRuStatement(undefined as unknown as [])).toEqual([]);
  });
});
