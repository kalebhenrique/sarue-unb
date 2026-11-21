import React from 'react';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { formatIra } from './IraResultPanel';
import type {
  IraMention,
  IraScenarioSemester,
} from '@/core';
import { IRA_MENTIONS, MAX_DISCIPLINES_PER_SEMESTER } from '@/core';

/** Teto de créditos por linha: 30 créditos = 450h — margem folgada acima de qualquer disciplina da UnB. */
const MAX_CREDITS_PER_DISCIPLINE = 30;

export interface IraSemesterCardProps {
  semester: IraScenarioSemester;
  semesterIra: number | null;
  onMentionChange: (disciplineId: string, mention: IraMention) => void;
  onRemoveDiscipline: (disciplineId: string) => void;
  onUpdateCredits: (disciplineId: string, credits: number) => void;
  onAddDiscipline: () => void;
  /** Remoção do semestre inteiro (oferecida só para semestres futuros). */
  onRemoveSemester?: () => void;
  /** Define se o acordeão inicia aberto no mobile (< md). */
  defaultExpandedMobile?: boolean;
}

const SEMESTER_STYLES: Record<IraScenarioSemester['kind'], string> = {
  history: 'bg-pastel-blue',
  unknown: 'bg-pastel-yellow',
  current: 'bg-pastel-green',
  future: 'bg-neutral-50',
};

/**
 * Célula de semestre na grade da calculadora: cabeçalho com rótulo, período,
 * IRA do semestre e, no semestre futuro, remoção no cabeçalho (o mesmo gesto
 * fantasma da linha de disciplina); linhas de
 * créditos + menção — no histórico e no "não identificado" cada linha traz
 * código + nome truncado (o SIGAA sabe o nome; esconder custa memória do
 * usuário), enquanto a simulação futura continua anônima; rodapé que adiciona
 * disciplina em qualquer semestre.
 */
export const IraSemesterCard: React.FC<IraSemesterCardProps> = ({
  semester,
  semesterIra,
  onMentionChange,
  onRemoveDiscipline,
  onUpdateCredits,
  onAddDiscipline,
  onRemoveSemester,
  defaultExpandedMobile = true,
}) => {
  const [mobileOpen, setMobileOpen] = React.useState(defaultExpandedMobile);
  const hasDisciplines = semester.disciplines.length > 0;
  const isFuture = semester.kind === 'future';
  const showIdentity = semester.kind === 'history' || semester.kind === 'unknown';
  const mobileTitle = semester.period
    ? `${semester.label} • ${semester.period}`
    : semester.label;

  return (
    <section
      aria-label={semester.label}
      className={
        isFuture && !hasDisciplines
          ? 'flex flex-col bg-neutral-50 border-2 border-dashed border-black/15 rounded-lg'
          : 'flex flex-col bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo'
      }
    >
      <div
        className={`px-3 py-2.5 ${SEMESTER_STYLES[semester.kind]} ${
          mobileOpen
            ? 'border-b-2 border-ink rounded-t-[6px]'
            : 'border-b-0 md:border-b-2 border-ink rounded-[6px] md:rounded-b-none'
        }`}
      >
        {/* Mobile: cabeçalho acordeão de 1 linha */}
        <div className="flex md:hidden items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue rounded-sm"
          >
            <span className="text-xs font-black text-black tracking-tight truncate min-w-0">
              {mobileTitle}
            </span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              {semesterIra != null && Number.isFinite(semesterIra) && (
                <span
                  className="text-xs font-black text-black tabular-nums"
                  title="IRA deste semestre (sem penalidade de trancamento)"
                >
                  {formatIra(semesterIra)}
                </span>
              )}
              <ChevronDown
                className={`w-4 h-4 stroke-[2.5] text-black transition-transform duration-150 ${
                  mobileOpen ? 'rotate-180' : ''
                }`}
              />
            </span>
          </button>
          {isFuture && onRemoveSemester && (
            <button
              type="button"
              onClick={onRemoveSemester}
              aria-label={`Remover ${semester.label} do cenário`}
              title="Remover semestre do cenário"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-neo-danger cursor-pointer hover:bg-pastel-red active:translate-y-px transition-[background-color,transform] shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
            >
              <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
            </button>
          )}
        </div>

        {/* Desktop: cabeçalho completo sempre aberto */}
        <div className="hidden md:block">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-black tracking-tight truncate min-w-0" title={semester.label}>
              {semester.label}
            </h3>
            {semesterIra != null && Number.isFinite(semesterIra) && (
              <span className="text-[11px] font-black text-black tabular-nums shrink-0" title="IRA deste semestre (sem penalidade de trancamento)">
                {formatIra(semesterIra)}
              </span>
            )}
            {isFuture && onRemoveSemester && (
              <button
                type="button"
                onClick={onRemoveSemester}
                aria-label={`Remover ${semester.label} do cenário`}
                title="Remover semestre do cenário"
                className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-neo-danger cursor-pointer hover:bg-pastel-red active:translate-y-px transition-[background-color,transform] shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
              >
                <Trash2 className="w-3 h-3 stroke-[2.5]" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 min-h-5">
            {semester.period && (
              <span className="inline-flex items-center rounded-full border-2 border-ink bg-paper dark:bg-neutral-300 dark:text-slate-50 px-1.5 py-0 text-[11px] font-black leading-4">
                {semester.period}
              </span>
            )}
            {semester.kind === 'current' && (
              <span className="text-[11px] font-bold text-neutral-600 leading-4">menções previstas</span>
            )}
            {semester.kind === 'unknown' && (
              <span className="text-[11px] font-bold text-neutral-600 leading-4">sem período</span>
            )}
          </div>
        </div>
      </div>

      {/* Corpo: acordeão animado no mobile, sempre expandido no desktop */}
      <div
        className={`grid transition-[grid-template-rows] duration-150 ease-out md:block ${
          mobileOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden md:overflow-visible flex flex-col flex-1">
          {hasDisciplines ? (
            <>
              <div className="hidden md:flex px-3 pb-1 pt-1.5 items-center gap-2" aria-hidden="true">
                <span className="w-14 shrink-0 text-center text-[11px] font-black uppercase tracking-wider text-neutral-600">Cr</span>
                <span className="flex-1 min-w-0 text-[11px] font-black uppercase tracking-wider text-neutral-600">Menção</span>
                <span className="w-7 shrink-0" />
              </div>
              <ul className="divide-y divide-black/10">
              {semester.disciplines.map((d, index) => (
                <li
                  key={d.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 md:flex-col md:items-stretch md:gap-1"
                >
                  <div className={showIdentity ? 'flex-1 min-w-0 md:flex-none' : 'flex-1 min-w-0 md:hidden'}>
                    <p
                      className="text-xs font-medium text-black leading-snug line-clamp-2 md:hidden"
                      title={d.name || `Disciplina ${index + 1}`}
                    >
                      {d.name || `Disciplina ${index + 1}`}
                    </p>
                    {d.code && (
                      <p className="text-[11px] font-bold text-neutral-600 leading-tight truncate md:hidden">
                        {d.code}
                      </p>
                    )}
                    {showIdentity && (
                      <p
                        className="hidden md:block text-[11px] font-bold text-neutral-600 leading-4 truncate"
                        title={d.code ? `${d.code} - ${d.name}` : d.name}
                      >
                        {d.code ? `${d.code} - ${d.name}` : d.name}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 md:gap-2 md:w-full">
                    <div className="w-10 shrink-0 md:w-14">
                      <NumberField
                        value={d.credits}
                        onValueChange={(v) =>
                          onUpdateCredits(
                            d.id,
                            Math.min(MAX_CREDITS_PER_DISCIPLINE, Math.max(0, v ?? 0)),
                          )
                        }
                        min={0}
                        max={MAX_CREDITS_PER_DISCIPLINE}
                        step={1}
                        smallStep={1}
                        locale="pt-BR"
                        format={{ useGrouping: false, maximumFractionDigits: 0 }}
                      >
                        <NumberFieldGroup className="h-9 md:h-7">
                          <NumberFieldInput
                            aria-label={`Créditos da disciplina ${index + 1} em ${semester.label}`}
                            className="h-full px-1 text-xs md:text-[11px] font-extrabold text-center"
                          />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                    <Select
                      value={d.mention ?? null}
                      onValueChange={(value) => {
                        if (value) onMentionChange(d.id, value as IraMention);
                      }}
                    >
                      <SelectTrigger
                        className="h-9 w-[4.5rem] gap-1 px-2 text-xs md:h-7 md:flex-1 md:w-auto md:min-w-[4.5rem] md:gap-2 md:text-[11px] md:px-1.5"
                        aria-label={`Menção da disciplina ${index + 1} em ${semester.label}`}
                      >
                        <SelectValue>
                          {d.mention ? (
                            <span className="font-black">{d.mention}</span>
                          ) : (
                            <span className="font-bold text-neutral-600">
                              {semester.kind === 'current' ? 'Prev.' : '—'}
                            </span>
                          )}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {IRA_MENTIONS.map((m) => (
                          <SelectItem key={m} value={m} className="text-xs font-black">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => onRemoveDiscipline(d.id)}
                      aria-label={`Remover disciplina ${index + 1} de ${semester.label}`}
                      title="Remover do cenário"
                      className="inline-flex items-center justify-center w-9 h-9 md:w-7 md:h-7 rounded-lg text-neo-danger cursor-pointer hover:bg-pastel-red active:translate-y-px transition-[background-color,transform] shrink-0 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
                    >
                      <Trash2 className="w-3.5 h-3.5 md:w-3 md:h-3 stroke-[2.5]" />
                    </button>
                  </div>
                </li>
              ))}
              </ul>
            </>
          ) : (
            <p className="px-3 py-4 text-[11px] font-bold text-neutral-600 text-center">
              {isFuture ? 'Semestre vazio' : 'Sem disciplinas'}
            </p>
          )}

          <div className="px-2 py-2 border-t-2 border-black/10 mt-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 md:h-7 w-full text-xs md:text-[11px] font-black text-neutral-600 hover:text-black"
              onClick={onAddDiscipline}
              disabled={semester.disciplines.length >= MAX_DISCIPLINES_PER_SEMESTER}
              aria-label={`Adicionar disciplina em ${semester.label}`}
            >
              <Plus className="w-3.5 h-3.5 md:w-3 md:h-3 stroke-[2.5]" />
              Adicionar disciplina
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
