import { useState, useEffect, useCallback } from 'react';
import { useContainer } from '../context/ContainerContext';
import {
  loadCachedStudentWallet,
  saveCachedStudentWallet,
  renderOfficialStudentCardPdf,
  subscribeToStudentWalletUpdates,
  type RuStatementEntry,
} from '@/core';

export interface StudentWalletState {
  studentName: string;
  matricula: string;
  courseName: string;
  level: string;
  shift?: string;
  cpfDigits: string | null;
  ruCardCode: string | null;
  ruCardValidity: string | null;
  ruCardPdfBase64: string | null;
  renderedCardDataUrl: string | null;
  renderedFullPageDataUrl: string | null;
  ruBalance: string | null;
  ruGroup: string | null;
  statement: RuStatementEntry[];
  updatedAt: string | null;
}

function normalizeCpfDigits(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

export function formatCpfDisplay(digits?: string | null): string {
  const clean = normalizeCpfDigits(digits);
  if (!clean) return 'Não identificado';
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
}

export function formatValidityDisplay(isoOrDate?: string | null): string {
  if (!isoOrDate) return 'Semestre vigente';
  const match = isoOrDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return isoOrDate;
}

export function formatCurrencyBrl(amount?: number | null): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return null;
  }
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function useStudentWallet() {
  const { useCases } = useContainer();
  const [wallet, setWallet] = useState<StudentWalletState>({
    studentName: 'Estudante UnB',
    matricula: '',
    courseName: 'Graduação UnB',
    level: 'GRADUAÇÃO',
    cpfDigits: null,
    ruCardCode: null,
    ruCardValidity: null,
    ruCardPdfBase64: null,
    renderedCardDataUrl: null,
    renderedFullPageDataUrl: null,
    ruBalance: null,
    ruGroup: null,
    statement: [],
    updatedAt: null,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadLocal = useCallback(async () => {
    try {
      const [profile, creds, cached] = await Promise.all([
        useCases.manageAcademicProfile.getProfile(),
        useCases.getCredentials.getAllCredentials(),
        loadCachedStudentWallet(),
      ]);

      let renderedCardDataUrl = cached.payload?.renderedCardDataUrl ?? null;
      let renderedFullPageDataUrl =
        cached.payload?.renderedFullPageDataUrl ?? null;

      // Se o PDF oficial está salvo no SQLite mas ainda não tinha sido renderizado em PNG, renderiza e salva no cache offline
      if (
        cached.payload?.ruCardPdfBase64 &&
        (!renderedCardDataUrl || !renderedFullPageDataUrl)
      ) {
        const rendered = await renderOfficialStudentCardPdf(
          cached.payload.ruCardPdfBase64
        );
        if (rendered) {
          renderedCardDataUrl = rendered.croppedDataUrl;
          renderedFullPageDataUrl = rendered.fullPageDataUrl;
          await saveCachedStudentWallet(
            {
              ...cached.payload,
              renderedCardDataUrl,
              renderedFullPageDataUrl,
            },
            false
          );
        }
      }

      const cpfDigits =
        normalizeCpfDigits(cached.payload?.cpf) ??
        normalizeCpfDigits(profile?.cpf) ??
        normalizeCpfDigits(creds.aprender3?.cpf);

      setWallet((prev) => {
        const nextStudentName =
          profile?.studentName ||
          (prev.studentName !== 'Estudante UnB'
            ? prev.studentName
            : 'Estudante UnB');
        const nextMatricula =
          profile?.matricula || creds.sigaa?.matricula || prev.matricula;
        const nextCourseName =
          profile?.courseName ||
          (prev.courseName !== 'Graduação — Universidade de Brasília'
            ? prev.courseName
            : 'Graduação — Universidade de Brasília');
        const nextLevel = profile?.level || prev.level || 'GRADUAÇÃO';
        const nextShift = profile?.shift ?? prev.shift;
        const nextCpf = cpfDigits ?? prev.cpfDigits;

        const hasExistingWallet =
          prev.updatedAt !== null ||
          prev.renderedCardDataUrl !== null ||
          prev.ruCardPdfBase64 !== null ||
          prev.ruCardCode !== null;

        if (!cached.payload && hasExistingWallet) {
          return {
            ...prev,
            studentName: nextStudentName,
            matricula: nextMatricula,
            courseName: nextCourseName,
            level: nextLevel,
            shift: nextShift,
            cpfDigits: nextCpf,
          };
        }

        const nextPdfBase64 =
          cached.payload?.ruCardPdfBase64 ?? prev.ruCardPdfBase64 ?? null;
        const nextRenderedCard =
          renderedCardDataUrl ??
          (nextPdfBase64 && nextPdfBase64 === prev.ruCardPdfBase64
            ? prev.renderedCardDataUrl
            : null);
        const nextFullPage =
          renderedFullPageDataUrl ??
          (nextPdfBase64 && nextPdfBase64 === prev.ruCardPdfBase64
            ? prev.renderedFullPageDataUrl
            : null);

        return {
          studentName: nextStudentName,
          matricula: nextMatricula,
          courseName: nextCourseName,
          level: nextLevel,
          shift: nextShift,
          cpfDigits: nextCpf,
          ruCardCode: cached.payload?.ruToken ?? prev.ruCardCode ?? null,
          ruCardValidity:
            cached.payload?.ruValidUntil ?? prev.ruCardValidity ?? null,
          ruCardPdfBase64: nextPdfBase64,
          renderedCardDataUrl: nextRenderedCard,
          renderedFullPageDataUrl: nextFullPage,
          ruBalance: formatCurrencyBrl(cached.payload?.ruBalance) ?? prev.ruBalance,
          ruGroup:
            cached.payload?.ruGroup !== null &&
            cached.payload?.ruGroup !== undefined
              ? `Grupo ${cached.payload.ruGroup}`
              : prev.ruGroup,
          statement:
            cached.payload?.ruEntries && cached.payload.ruEntries.length > 0
              ? cached.payload.ruEntries
              : prev.statement,
          updatedAt: cached.updatedAt ?? prev.updatedAt,
        };
      });
    } catch (e) {
      console.warn('[useStudentWallet] Erro ao carregar dados locais:', e);
    } finally {
      setIsLoading(false);
    }
  }, [useCases]);

  useEffect(() => {
    void loadLocal();
    return subscribeToStudentWalletUpdates(() => {
      void loadLocal();
    });
  }, [loadLocal]);

  return {
    wallet,
    isLoading,
    reload: loadLocal,
  };
}
