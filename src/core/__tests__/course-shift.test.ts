import { describe, it, expect } from 'vitest';
import {
  catalogShiftMatchesFamily,
  preferShiftCompatible,
  resolveCourseIdFromCatalog,
  shiftFamilyFromSigaaToken,
  type CourseCatalogItem,
  type CurriculumStructure,
} from '@/core';

const MOCK_CATALOG: CourseCatalogItem[] = [
  {
    id: '414287',
    name: 'FARMÁCIA',
    degree: 'Bacharelado',
    shift: 'NOTURNO',
    campus: 'BRASÍLIA',
    modality: 'Presencial',
    curriculaIds: ['2071865', '338'],
  },
  {
    id: '414286',
    name: 'FARMÁCIA',
    degree: 'Bacharelado',
    shift: 'DIURNO',
    campus: 'BRASÍLIA',
    modality: 'Presencial',
    curriculaIds: ['339'],
  },
  {
    id: '414906',
    name: 'FARMÁCIA',
    degree: 'Bacharelado',
    shift: 'DIURNO',
    campus: 'BRASÍLIA',
    modality: 'Presencial',
    curriculaIds: ['15687684'],
  },
  {
    id: '414099',
    name: 'ADMINISTRAÇÃO',
    degree: 'Bacharelado',
    shift: 'NOTURNO',
    campus: 'BRASÍLIA',
    modality: 'Presencial',
    curriculaIds: ['458'],
  },
];

describe('course-shift', () => {
  describe('shiftFamilyFromSigaaToken', () => {
    it('converte tokens do portal do discente e do histórico', () => {
      expect(shiftFamilyFromSigaaToken('N')).toBe('NOTURNO');
      expect(shiftFamilyFromSigaaToken('NOTURNO')).toBe('NOTURNO');
      expect(shiftFamilyFromSigaaToken('Noturno')).toBe('NOTURNO');
      expect(shiftFamilyFromSigaaToken('MT')).toBe('DIURNO');
      expect(shiftFamilyFromSigaaToken('M')).toBe('DIURNO');
      expect(shiftFamilyFromSigaaToken('V')).toBe('DIURNO');
      expect(shiftFamilyFromSigaaToken('DIURNO')).toBe('DIURNO');
      expect(shiftFamilyFromSigaaToken('Diurno')).toBe('DIURNO');
      expect(shiftFamilyFromSigaaToken('INTEGRAL')).toBe('INTEGRAL');
      expect(shiftFamilyFromSigaaToken('Integral')).toBe('INTEGRAL');
      expect(shiftFamilyFromSigaaToken('Matutino e Vespertino')).toBe('DIURNO');
    });

    it('ignora graus e valores vazios (sem pistas de turno)', () => {
      expect(shiftFamilyFromSigaaToken('Bacharelado')).toBeNull();
      expect(shiftFamilyFromSigaaToken('Licenciatura')).toBeNull();
      expect(shiftFamilyFromSigaaToken('')).toBeNull();
      expect(shiftFamilyFromSigaaToken(null)).toBeNull();
      expect(shiftFamilyFromSigaaToken(undefined)).toBeNull();
    });

    it('mantém valores legados já persistidos no perfil', () => {
      expect(shiftFamilyFromSigaaToken('DIURNO')).toBe('DIURNO');
      expect(shiftFamilyFromSigaaToken('Noturno')).toBe('NOTURNO');
    });
  });

  describe('catalogShiftMatchesFamily', () => {
    it('noturno só casa com noturno', () => {
      expect(catalogShiftMatchesFamily('NOTURNO', 'NOTURNO')).toBe(true);
      expect(catalogShiftMatchesFamily('Noturno', 'NOTURNO')).toBe(true);
      expect(catalogShiftMatchesFamily('DIURNO', 'NOTURNO')).toBe(false);
      expect(catalogShiftMatchesFamily('Matutino e Vespertino', 'NOTURNO')).toBe(false);
    });

    it('diurno aceita diurno, integral e variantes matutinas', () => {
      expect(catalogShiftMatchesFamily('DIURNO', 'DIURNO')).toBe(true);
      expect(catalogShiftMatchesFamily('Matutino e Vespertino', 'DIURNO')).toBe(true);
      expect(catalogShiftMatchesFamily('INTEGRAL', 'DIURNO')).toBe(true);
      expect(catalogShiftMatchesFamily('NOTURNO', 'DIURNO')).toBe(false);
    });

    it('integral casa com integral', () => {
      expect(catalogShiftMatchesFamily('INTEGRAL', 'INTEGRAL')).toBe(true);
      expect(catalogShiftMatchesFamily('DIURNO', 'INTEGRAL')).toBe(false);
    });

    it('entrada sem turno não casa com nada', () => {
      expect(catalogShiftMatchesFamily(null, 'DIURNO')).toBe(false);
      expect(catalogShiftMatchesFamily(undefined, 'NOTURNO')).toBe(false);
      expect(catalogShiftMatchesFamily('', 'DIURNO')).toBe(false);
    });
  });

  describe('preferShiftCompatible', () => {
    const matrizes: CurriculumStructure[] = [
      { id: '1', courseId: 'x', code: 'a', courseName: 'X', status: 'Ativa', shift: 'Noturno', mandatoryDisciplines: [], electiveDisciplines: [], complementaryDisciplines: [] },
      { id: '2', courseId: 'x', code: 'b', courseName: 'X', status: 'Ativa', shift: 'Matutino e Vespertino', mandatoryDisciplines: [], electiveDisciplines: [], complementaryDisciplines: [] },
      { id: '3', courseId: 'x', code: 'c', courseName: 'X', status: 'Ativa', shift: 'Noturno', mandatoryDisciplines: [], electiveDisciplines: [], complementaryDisciplines: [] },
    ];

    it('coloca as matrizes do turno do discente primeiro', () => {
      const ordered = preferShiftCompatible(matrizes, 'DIURNO');
      expect(ordered.map((m) => m.id)).toEqual(['2', '1', '3']);
      const orderedNoturno = preferShiftCompatible(matrizes, 'NOTURNO');
      expect(orderedNoturno.map((m) => m.id)).toEqual(['1', '3', '2']);
    });

    it('mantém a ordem sem família conhecida', () => {
      expect(preferShiftCompatible(matrizes, null)).toEqual(matrizes);
    });
  });

  describe('resolveCourseIdFromCatalog', () => {
    it('desambigua cursos homônimos pelo turno do SIGAA', () => {
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'FARMÁCIA', 'N')).toBe('414287');
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'FARMÁCIA', 'NOTURNO')).toBe('414287');
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'FARMÁCIA', 'MT')).toBe('414286');
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'FARMÁCIA', 'DIURNO')).toBe('414286');
    });

    it('sem pista de turno mantém o comportamento legado (primeira entrada)', () => {
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'FARMÁCIA')).toBe('414287');
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'FARMÁCIA', 'Bacharelado')).toBe('414287');
    });

    it('casamento por nome ignora acentos e caixa', () => {
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'Farmácia', 'MT')).toBe('414286');
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'farmacia', 'N')).toBe('414287');
    });

    it('curso único do catálogo resolve direto', () => {
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'ADMINISTRAÇÃO', 'DIURNO')).toBe('414099');
    });

    it('turno sem entrada compatível cai na primeira do mesmo nome', () => {
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'ADMINISTRAÇÃO', 'MT')).toBe('414099');
    });

    it('nome fora do catálogo devolve null', () => {
      expect(resolveCourseIdFromCatalog(MOCK_CATALOG, 'MEDICINA')).toBeNull();
      expect(resolveCourseIdFromCatalog([], 'FARMÁCIA', 'MT')).toBeNull();
    });
  });
});
