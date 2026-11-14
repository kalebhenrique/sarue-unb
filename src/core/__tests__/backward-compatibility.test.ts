import { describe, it, expect } from 'vitest';
import {
  parseAcademicProfileJson,
  parseCurriculumListJson,
  parseIraScenarioJson,
  parseSavedGradeClassesJson,
} from '../infrastructure/persistence-codec';

describe('Compatibilidade Retroativa de Persistência (SQLite / localStorage)', () => {
  describe('parseAcademicProfileJson', () => {
    it('hidrata perfil legado mínimo (v0.1/v0.2) preenchendo arrays obrigatórios ausentes', () => {
      const legacyJson = JSON.stringify({
        matricula: '221012345',
        courseName: 'CIÊNCIA DA COMPUTAÇÃO',
      });

      const profile = parseAcademicProfileJson(legacyJson);
      expect(profile).not.toBeNull();
      expect(profile?.matricula).toBe('221012345');
      expect(profile?.level).toBe('GRADUAÇÃO');
      expect(profile?.completedDisciplines).toEqual([]);
      expect(profile?.manualCompletedCodes).toEqual([]);
      expect(profile?.manualUncompletedCodes).toEqual([]);
      expect(typeof profile?.updatedAt).toBe('string');
    });

    it('normaliza customCurriculum legado em snake_case sem perder disciplinas', () => {
      const legacyWithCustomCurr = JSON.stringify({
        matricula: '221012345',
        courseName: 'ENGENHARIA DE SOFTWARE',
        customCurriculum: {
          id: '673-1',
          course_id: '673',
          course_name: 'ENGENHARIA DE SOFTWARE',
          code: '673/1',
          mandatory_disciplines: [
            { code: 'CIC0004', name: 'APC', workload_hours: 60 },
          ],
        },
      });

      const profile = parseAcademicProfileJson(legacyWithCustomCurr);
      expect(profile?.customCurriculum?.courseId).toBe('673');
      expect(profile?.customCurriculum?.mandatoryDisciplines).toHaveLength(1);
      expect(profile?.customCurriculum?.mandatoryDisciplines[0].workloadHours).toBe(60);
      expect(profile?.customCurriculum?.electiveDisciplines).toEqual([]);
      expect(profile?.customCurriculum?.complementaryDisciplines).toEqual([]);
    });

    it('retorna null graciosamente para JSON corrompido ou sem matrícula e descarta campos sujos', () => {
      expect(parseAcademicProfileJson('{corrupted')).toBeNull();
      expect(parseAcademicProfileJson('{"courseName": "CIC"}')).toBeNull();
      expect(parseAcademicProfileJson('null')).toBeNull();

      const dirtyProfile = parseAcademicProfileJson(
        JSON.stringify({
          matricula: '221012345',
          ira: '3.95-invalid-string',
          injectedPollutedKey: 'should-be-stripped',
        }),
      );
      expect(dirtyProfile?.ira).toBeUndefined();
      expect((dirtyProfile as unknown as Record<string, unknown>).injectedPollutedKey).toBeUndefined();
    });
  });

  describe('parseSavedGradeClassesJson', () => {
    it('normaliza turmas salvas em formato legado e descarta slots malformados sem fabricar horário falso', () => {
      const legacyGradeData = JSON.stringify([
        {
          discipline_code: 'CIC0004',
          discipline_name: 'APC',
          class_code: '01',
          schedule_code: '24M34',
          schedule_slots: [
            {
              day: 2,
              day_name: 'Seg',
              shift: 'M',
              period: 3,
              time_range: '10:00 - 10:55',
              global_slot_index: 2,
            },
            {
              // Slot corrompido sem day/shift válidos: deve ser descartado em vez de virar Seg M1
              day_name: 'Corrompido',
            },
          ],
        },
        {
          // Turma sem class_code: deve ser descartada para não colidir ID
          discipline_code: 'MAT0025',
        },
      ]);

      const classes = parseSavedGradeClassesJson(legacyGradeData);
      expect(classes).toHaveLength(1);
      expect(classes[0].id).toBe('CIC0004-01');
      expect(classes[0].disciplineCode).toBe('CIC0004');
      expect(classes[0].teachers).toEqual([]);
      expect(classes[0].classroom).toBe('A definir');
      expect(classes[0].scheduleSlots).toHaveLength(1);
      expect(classes[0].scheduleSlots[0].dayName).toBe('Seg');
      expect(classes[0].scheduleSlots[0].globalSlotIndex).toBe(2);
    });

    it('degrada para lista vazia se o JSON estiver corrompido', () => {
      expect(parseSavedGradeClassesJson('invalid-json')).toEqual([]);
      expect(parseSavedGradeClassesJson('{}')).toEqual([]);
    });
  });

  describe('parseIraScenarioJson', () => {
    it('preenche contadores de trancamento ausentes de versões anteriores', () => {
      const legacyScenario = JSON.stringify({
        semesters: [
          {
            id: 'sem-1',
            label: '1º Semestre',
            disciplines: [
              { id: 'CIC0004', code: 'CIC0004', name: 'APC', credits: 4, mention: 'SS' },
              { id: 'MAT0025', code: 'MAT0025', name: 'Cálculo 1', mention: 'INVALID_MENTION' },
            ],
          },
        ],
      });

      const scenario = parseIraScenarioJson(legacyScenario);
      expect(scenario).not.toBeNull();
      expect(scenario?.baseTrancadasObrigatorias).toBe(0);
      expect(scenario?.baseTrancadasOptativas).toBe(0);
      expect(scenario?.extraTrancadasObrigatorias).toBe(0);
      expect(scenario?.extraTrancadasOptativas).toBe(0);
      expect(scenario?.semesters[0].disciplines[0].mention).toBe('SS');
      expect(scenario?.semesters[0].disciplines[1].mention).toBeNull();
      expect(scenario?.semesters[0].disciplines[1].credits).toBe(4);
    });

    it('retorna null se semesters não for um array ou JSON inválido', () => {
      expect(parseIraScenarioJson('{}')).toBeNull();
      expect(parseIraScenarioJson('broken')).toBeNull();
    });
  });

  describe('parseCurriculumListJson', () => {
    it('aceita tanto camelCase (cache local) quanto snake_case (payload bruto do CDN)', () => {
      const mixedJson = JSON.stringify([
        {
          id: '100',
          course_id: '414002',
          course_name: 'CIÊNCIA DA COMPUTAÇÃO',
          code: '100/1',
          mandatory_disciplines: [
            { code: 'CIC0004', name: 'APC', workload_hours: 60, nature: 'Obrigatória' },
          ],
        },
      ]);

      const list = parseCurriculumListJson(mixedJson);
      expect(list).toHaveLength(1);
      expect(list[0].courseId).toBe('414002');
      expect(list[0].mandatoryDisciplines[0].workloadHours).toBe(60);
      expect(list[0].mandatoryDisciplines[0].prerequisites).toEqual([]);
      expect(list[0].mandatoryDisciplines[0].equivalences).toEqual([]);
    });
  });
});
