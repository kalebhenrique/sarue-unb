import React, { useRef, useState } from "react";
import {
  AlertCircle,
  FileCheck2,
  FileText,
  FileUp,
  Upload,
} from "lucide-react";
import { Button, toast } from "@/components/ui";
import { useContainer } from "@/context/ContainerContext";
import {
  notifyMyCourseListeners,
  resetMyCourseCache,
} from "@/hooks/useMyCourse";
import type { CurriculumStructure, StudentAcademicProfile } from "@/core";

export interface TranscriptImportResult {
  profile: StudentAcademicProfile;
  matchedCurriculum?: CurriculumStructure;
}

export interface TranscriptImportDropzoneProps {
  /** "onboarding" exibe dropzone ampla + prévia detalhada; "compact" exibe linha de painel em Configurações */
  variant?: "onboarding" | "compact";
  /** Perfil já importado para exibir estado atual/prévia */
  initialProfile?: StudentAcademicProfile | null;
  /** Disparado quando o estado de leitura (loading) muda */
  onBusyChange?: (busy: boolean) => void;
  /** Disparado quando o PDF é importado e salvo com sucesso */
  onImported?: (result: TranscriptImportResult) => void;
}

function formatIra(ira?: number): string {
  if (typeof ira !== "number" || !Number.isFinite(ira)) return "—";
  return ira.toFixed(4).replace(".", ",");
}

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Importador local de Histórico Escolar (PDF do SIGAA UnB).
 * Compartilhado entre o Passo 3 (sem login) do Onboarding e a seção
 * "Contas conectadas" de Configurações.
 */
export const TranscriptImportDropzone: React.FC<
  TranscriptImportDropzoneProps
> = ({
  variant = "onboarding",
  initialProfile = null,
  onBusyChange,
  onImported,
}) => {
  const { useCases } = useContainer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<StudentAcademicProfile | null>(
    initialProfile,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isParsingRef = useRef(false);
  isParsingRef.current = isParsing;

  React.useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
    }
  }, [initialProfile]);

  const finishImport = React.useCallback(
    (result: TranscriptImportResult, name: string) => {
      resetMyCourseCache();
      notifyMyCourseListeners();

      setProfile(result.profile);
      setFileName(name);
      onImported?.(result);

      if (variant === "compact") {
        const completedCount = result.profile.completedDisciplines.filter(
          (d) => d.isCompleted,
        ).length;
        toast.add({
          title: "Histórico importado com sucesso!",
          description: `${result.profile.courseName} · ${completedCount} disciplinas concluídas.`,
          type: "success",
        });
      }
    },
    [onImported, variant],
  );

  const reportImportError = React.useCallback(
    (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : "Não foi possível ler este PDF. Tente emitir novamente pelo SIGAA.";
      setError(msg);
      if (variant === "compact") {
        toast.add({
          title: "Erro ao importar histórico",
          description: msg,
          type: "error",
        });
      }
    },
    [variant],
  );

  const processFilePath = React.useCallback(
    async (filePath: string) => {
      if (isParsingRef.current) return;
      setError(null);
      if (!filePath.toLowerCase().endsWith(".pdf")) {
        setError("Envie um arquivo no formato PDF (.pdf) emitido pelo SIGAA.");
        return;
      }

      setIsParsing(true);
      onBusyChange?.(true);
      try {
        const result =
          await useCases.manageAcademicProfile.importFromPdfPath(filePath);
        const basename = filePath.split(/[\\/]/).pop() || filePath;
        finishImport(result, basename);
      } catch (err) {
        reportImportError(err);
      } finally {
        setIsParsing(false);
        onBusyChange?.(false);
      }
    },
    [finishImport, onBusyChange, reportImportError, useCases.manageAcademicProfile],
  );

  // Drag-and-drop nativo do Tauri 2 (macOS Finder, Windows Explorer, Linux):
  // no Tauri, arquivos arrastados do SO chegam via Webview.onDragDropEvent.
  // Mantém o listener ativo mesmo após o 1º import para permitir trocar arquivo arrastando.
  React.useEffect(() => {
    if (variant !== "onboarding") return;
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragging(true);
          } else if (event.payload.type === "leave") {
            setIsDragging(false);
          } else if (event.payload.type === "drop") {
            setIsDragging(false);
            const firstPath = event.payload.paths?.[0];
            if (firstPath) {
              void processFilePath(firstPath);
            }
          }
        }),
      )
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [variant, processFilePath]);

  const openFilePicker = () => {
    if (isParsing) return;
    inputRef.current?.click();
  };

  const processFile = async (file: File) => {
    setError(null);
    if (!isPdfFile(file)) {
      setError("Envie um arquivo no formato PDF (.pdf) emitido pelo SIGAA.");
      return;
    }

    setIsParsing(true);
    onBusyChange?.(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const result = await useCases.manageAcademicProfile.importFromPdf(bytes);
      finishImport(result, file.name);
    } catch (err) {
      reportImportError(err);
    } finally {
      setIsParsing(false);
      onBusyChange?.(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reseta o input para permitir reenviar o mesmo arquivo se necessário
    e.target.value = "";
    if (file) {
      void processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isParsing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processFile(file);
    }
  };

  const completedCount =
    profile?.completedDisciplines.filter((d) => d.isCompleted).length ?? 0;
  const enrolledCount =
    profile?.completedDisciplines.filter((d) => d.situation === "MATR")
      .length ?? 0;

  if (variant === "compact") {
    return (
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleInputChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />

        <div className="border-2 border-ink rounded-lg bg-paper p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-lg border-2 border-ink bg-neo-yellow text-ink flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <FileText className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-black text-black">
                  Histórico (PDF)
                </span>
                {profile && (
                  <span className="px-2 py-0.5 rounded-full border-2 border-ink bg-neo-green text-ink text-[11px] font-bold">
                    Importado
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-neutral-600 leading-snug mt-0.5 truncate">
                {profile
                  ? `${profile.courseName}${profile.curriculumCode ? ` (${profile.curriculumCode})` : ""} · ${completedCount} concluídas`
                  : "Importe o PDF do SIGAA para usar Fluxograma, IRA e Grade sem conectar conta."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            isLoading={isParsing}
            onClick={openFilePicker}
            className="w-full sm:w-auto min-h-11 sm:min-h-8 shrink-0"
          >
            <Upload className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{profile ? "Atualizar PDF" : "Importar PDF"}</span>
          </Button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border-2 border-neo-danger bg-pastel-red px-3.5 py-2.5 flex items-start gap-2"
          >
            <AlertCircle
              className="w-4 h-4 stroke-[2.5] text-ink-error shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-xs font-bold text-ink-error">{error}</p>
          </div>
        )}
      </div>
    );
  }

  // Variante "onboarding": dropzone ampla + prévia de sucesso
  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!profile ? (
        <div className="rounded-lg border-2 border-ink bg-paper shadow-neo-sm md:shadow-(--neo-card-shadow) p-4 md:p-5">
          <div
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-xl border-2 p-6 md:p-8 text-center transition-colors duration-150 ${
              isDragging
                ? "border-solid border-neo-blue dark:border-sticker-blue bg-pastel-blue"
                : "border-dashed border-ink/35 dark:border-neutral-400/50 bg-canvas/50 dark:bg-canvas/40"
            }`}
          >
            <div
              className="w-12 h-12 mx-auto rounded-lg border-2 border-ink bg-neo-yellow text-ink flex items-center justify-center mb-3"
              aria-hidden="true"
            >
              <FileUp className="w-6 h-6 stroke-[2.5]" />
            </div>

            <h3 className="text-base md:text-lg font-black text-black tracking-tight">
              {isDragging
                ? "Solte o PDF aqui para importar"
                : "Envie o PDF do histórico do SIGAA"}
            </h3>
            <p className="text-xs md:text-sm font-medium text-neutral-600 mt-1 max-w-md mx-auto leading-relaxed">
              Aceita o histórico padrão ou analítico (com ementas). Tudo é lido
              localmente no seu dispositivo.
            </p>

            <div className="mt-5 flex justify-center">
              <Button
                type="button"
                size="md"
                isLoading={isParsing}
                onClick={openFilePicker}
                className="min-h-12 md:min-h-10"
              >
                <Upload className="w-4 h-4 stroke-[2.5]" />
                <span>Escolher arquivo PDF</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div
          aria-live="polite"
          className="rounded-lg border-2 border-ink bg-pastel-green dark:bg-paper dark:border-t-[6px] dark:border-t-neo-green shadow-neo-sm md:shadow-(--neo-card-shadow) p-5"
        >
          <div className="flex items-start gap-3.5">
            <div
              className="w-10 h-10 rounded-lg border-2 border-ink bg-neo-green text-ink flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <FileCheck2 className="w-5 h-5 stroke-[2.5]" />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-base font-black text-black leading-snug">
                {profile.courseName}
              </h3>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                {(profile.matricula || profile.curriculumCode) && (
                  <span className="font-sans text-xs font-semibold text-neutral-700 tabular-nums">
                    {[
                      profile.matricula ? `Matrícula ${profile.matricula}` : null,
                      profile.curriculumCode ?? null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </span>
                )}
                {fileName && (
                  <span className="text-xs font-medium text-neutral-600 truncate max-w-[200px]">
                    {fileName}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t-2 border-black/10 grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block">
                Concluídas
              </span>
              <span className="text-xl md:text-2xl font-black text-black tabular-nums">
                {completedCount}
              </span>
            </div>
            <div className="min-w-0 border-l-2 border-black/10">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block">
                Cursando
              </span>
              <span className="text-xl md:text-2xl font-black text-black tabular-nums">
                {enrolledCount}
              </span>
            </div>
            <div className="min-w-0 border-l-2 border-black/10">
              <span className="text-[11px] font-black uppercase tracking-wider text-neutral-600 block">
                IRA
              </span>
              <span className="text-xl md:text-2xl font-black text-black tabular-nums">
                {formatIra(profile.ira)}
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t-2 border-black/10 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-ink-success">
              Histórico pronto para uso
            </span>
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isParsing}
              className="cursor-pointer text-xs font-extrabold underline decoration-2 underline-offset-2 text-neutral-600 hover:text-black focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue rounded-xs py-1 disabled:opacity-50"
            >
              Trocar arquivo
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border-2 border-neo-danger bg-pastel-red px-4 py-3 flex items-start gap-2.5"
        >
          <AlertCircle
            className="w-4 h-4 stroke-[2.5] text-ink-error shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-xs font-bold text-ink-error leading-snug">
            {error}
          </p>
        </div>
      )}
    </div>
  );
};
