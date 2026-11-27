import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  Calendar,
  Calculator,
  CheckSquare,
  Download,
  GraduationCap,
  HardDriveDownload,
  LayoutGrid,
  Link2,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  type LucideIcon,
} from "lucide-react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SegmentedControl,
  toast,
} from "@/components/ui";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useContainer } from "@/context/ContainerContext";
import { resetMyCourseCache } from "@/hooks/useMyCourse";
import { resetGradeCache } from "@/hooks/useGrade";
import {
  applyUserBackup,
  collectUserBackup,
  downloadOrShareBackupFile,
  parseUserBackupJson,
  type BackupCategoryKey,
  type BackupImportMode,
  type ParsedUserBackup,
  type UserBackupSettings,
} from "@/core";

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
}

const CATEGORY_META: Record<BackupCategoryKey, CategoryMeta> = {
  curriculum: {
    label: "Currículo e fluxograma",
    icon: GraduationCap,
  },
  disciplineGrades: {
    label: "Notas e faltas manuais",
    icon: BookMarked,
  },
  calendarEvents: {
    label: "Calendário pessoal",
    icon: Calendar,
  },
  savedGrades: {
    label: "Grades horárias salvas",
    icon: LayoutGrid,
  },
  iraScenario: {
    label: "Simulador de IRA",
    icon: Calculator,
  },
  courseAssociations: {
    label: "Vínculos de turmas",
    icon: Link2,
  },
  feedStates: {
    label: "Tarefas concluídas e arquivadas",
    icon: CheckSquare,
  },
  settings: {
    label: "Preferências e notificações",
    icon: SlidersHorizontal,
  },
};

function formatBackupDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "data desconhecida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export interface DataBackupSectionProps {
  appVersion: string;
  onSettingsRestored: (settings: UserBackupSettings) => void | Promise<void>;
}

export const DataBackupSection: React.FC<DataBackupSectionProps> = ({
  appVersion,
  onSettingsRestored,
}) => {
  const { repos } = useContainer();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<ParsedUserBackup | null>(
    null,
  );
  const [selectedCategories, setSelectedCategories] = useState<
    BackupCategoryKey[]
  >([]);
  const [importMode, setImportMode] = useState<BackupImportMode>("merge");

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const payload = await collectUserBackup({ repos, appVersion });
      const { filename, method } = await downloadOrShareBackupFile(payload);
      if (method === "cancelled") {
        return;
      }
      toast.add({
        title: "Backup exportado",
        description:
          method === "share"
            ? `Arquivo ${filename} pronto para salvar ou compartilhar.`
            : method === "save"
              ? `Arquivo ${filename} salvo com sucesso.`
              : `Arquivo ${filename} salvo nos seus downloads.`,
        type: "success",
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível gerar o arquivo de backup.";
      toast.add({
        title: "Erro ao exportar backup",
        description: message,
        type: "error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    // Reseta o input para permitir reimportar o mesmo arquivo em seguida
    event.target.value = "";
    if (!file) return;

    try {
      const rawText = await file.text();
      const parsed = parseUserBackupJson(rawText);
      setPendingBackup(parsed);
      setSelectedCategories([...parsed.availableCategories]);
      setImportMode("merge");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível ler o arquivo de backup selecionado.";
      toast.add({
        title: "Backup inválido",
        description: message,
        type: "error",
      });
    }
  };

  const toggleCategory = (key: BackupCategoryKey) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key],
    );
  };

  const handleToggleAllCategories = () => {
    if (!pendingBackup) return;
    if (selectedCategories.length === pendingBackup.availableCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories([...pendingBackup.availableCategories]);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingBackup || selectedCategories.length === 0) return;
    setIsImporting(true);
    try {
      const result = await applyUserBackup(
        pendingBackup,
        {
          mode: importMode,
          categories: selectedCategories,
        },
        { repos },
      );

      if (result.restoredCategories.includes("curriculum")) {
        resetMyCourseCache();
      }
      if (result.restoredCategories.includes("savedGrades")) {
        resetGradeCache();
      }
      if (result.appliedSettings) {
        await onSettingsRestored(result.appliedSettings);
      }

      const restoredCount = result.restoredCategories.length;
      setPendingBackup(null);
      toast.add({
        title: "Backup restaurado",
        description:
          restoredCount === 1
            ? "1 categoria foi restaurada neste dispositivo."
            : `${restoredCount} categorias foram restauradas neste dispositivo.`,
        type: "success",
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível restaurar o backup selecionado.";
      toast.add({
        title: "Erro ao restaurar backup",
        description: message,
        type: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const allSelected = Boolean(
    pendingBackup &&
      selectedCategories.length === pendingBackup.availableCategories.length,
  );

  return (
    <>
      <SettingsSection icon={HardDriveDownload} label="Backup e Dados">
        <div className="space-y-4">
          <div className="max-w-xl">
            <span className="text-xs font-black text-black block">
              Exportar e importar seus dados locais
            </span>
            <p className="text-xs font-semibold text-neutral-600 leading-relaxed mt-1">
              Leve suas marcações do currículo, notas e faltas manuais, eventos
              pessoais do calendário, grades salvas, simulador de IRA, vínculos
              de turmas e preferências para outro dispositivo ou guarde uma
              cópia de segurança.
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border-2 border-ink bg-canvas px-3.5 py-2.5">
            <ShieldCheck
              className="w-4 h-4 stroke-[2.5] text-ink-success shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold text-neutral-700 leading-snug">
              Por segurança, suas senhas do cofre, CPF, carteirinha estudantil e
              dados sincronizados das plataformas nunca são incluídos no
              arquivo.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-1">
            <Button
              type="button"
              variant="primary"
              size="md"
              isLoading={isExporting}
              disabled={isExporting || isImporting}
              onClick={() => void handleExport()}
              className="w-full sm:w-auto"
            >
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Exportar Backup</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isExporting || isImporting}
              onClick={handleOpenFilePicker}
              className="w-full sm:w-auto"
            >
              <Upload className="w-4 h-4 stroke-[2.5]" />
              <span>Importar Backup</span>
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
              aria-label="Selecionar arquivo de backup JSON"
            />
          </div>
        </div>
      </SettingsSection>

      <Dialog
        open={Boolean(pendingBackup)}
        onOpenChange={(open) => {
          if (!open && !isImporting) {
            setPendingBackup(null);
          }
        }}
      >
        <DialogContent
          showCloseButton={!isImporting}
          className="sm:max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col"
        >
          <DialogHeader className="pr-8">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-9 h-9 rounded-lg border-2 border-ink bg-sticker-blue text-ink flex items-center justify-center shrink-0">
                <HardDriveDownload
                  className="w-5 h-5 stroke-[2.5]"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <DialogTitle>Restaurar Backup</DialogTitle>
                {pendingBackup && (
                  <DialogDescription className="mt-0.5">
                    Gerado em {formatBackupDate(pendingBackup.payload.exportedAt)}{" "}
                    · v{pendingBackup.payload.appVersion}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          {pendingBackup && (
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pr-0.5">
              {/* Modo de restauração */}
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wide text-neutral-600 block">
                  Modo de restauração
                </span>
                <SegmentedControl
                  size="md"
                  ariaLabel="Modo de restauração do backup"
                  value={importMode}
                  onValueChange={(val) => setImportMode(val as BackupImportMode)}
                  className="w-full"
                  options={[
                    {
                      value: "merge",
                      label: "Mesclar",
                      title: "Mantém dados locais e adiciona ou atualiza com os do backup",
                    },
                    {
                      value: "replace",
                      label: "Substituir",
                      title: "Substitui os dados locais das categorias marcadas",
                    },
                  ]}
                />
                <p className="text-xs font-semibold text-neutral-600 leading-snug">
                  {importMode === "merge"
                    ? "Mantém o que já existe neste dispositivo e adiciona ou atualiza com os dados do arquivo."
                    : "Substitui os dados locais das categorias selecionadas pelos do arquivo. Seu histórico oficial do SIGAA permanece intacto."}
                </p>

                {importMode === "replace" && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-lg border-2 border-ink bg-pastel-yellow text-black dark:bg-paper dark:border-l-[6px] dark:border-l-neo-yellow px-3.5 py-2.5"
                  >
                    <AlertTriangle
                      className="w-4 h-4 stroke-[2.5] shrink-0 mt-0.5 text-ink-disc-yellow dark:text-neo-yellow"
                      aria-hidden="true"
                    />
                    <p className="text-xs font-bold leading-snug text-black">
                      Alterações locais não presentes no backup serão removidas
                      nas categorias marcadas abaixo.
                    </p>
                  </div>
                )}
              </div>

              {/* Categorias encontradas no arquivo */}
              <div className="space-y-2 pt-2 border-t-2 border-black/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wide text-neutral-600">
                    O que restaurar ({selectedCategories.length}/
                    {pendingBackup.availableCategories.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleAllCategories}
                    className="cursor-pointer text-xs font-bold text-neutral-600 hover:text-black underline underline-offset-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue focus-visible:ring-offset-2 rounded"
                  >
                    {allSelected ? "Desmarcar tudo" : "Selecionar tudo"}
                  </button>
                </div>

                <div className="space-y-2">
                  {pendingBackup.availableCategories.map((key) => {
                    const summary = pendingBackup.categories[key];
                    const meta = CATEGORY_META[key];
                    const Icon = meta.icon;
                    const checked = selectedCategories.includes(key);

                    return (
                      <label
                        key={key}
                        className={
                          checked
                            ? "cursor-pointer min-h-12 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border-2 border-ink bg-pastel-blue dark:bg-paper transition-colors duration-150"
                            : "cursor-pointer min-h-12 flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border-2 border-ink bg-paper dark:bg-neutral-50 hover:bg-neutral-100 opacity-80 transition-colors duration-150"
                        }
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className="w-4 h-4 stroke-[2.5] text-blue-ink shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-black text-black block truncate">
                              {meta.label}
                            </span>
                            <span className="text-xs font-semibold text-neutral-600 block truncate">
                              {summary.detail}
                            </span>
                          </div>
                        </div>

                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleCategory(key)}
                          aria-label={`Restaurar ${meta.label}`}
                          className="data-checked:bg-neo-blue data-checked:text-white shrink-0"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="border-t-2 border-black/10 pt-3">
            <Button
              type="button"
              variant="outline"
              size="md"
              disabled={isImporting}
              onClick={() => setPendingBackup(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant={importMode === "replace" ? "destructive" : "primary"}
              size="md"
              isLoading={isImporting}
              disabled={selectedCategories.length === 0 || isImporting}
              onClick={() => void handleConfirmImport()}
            >
              <span>
                {importMode === "replace"
                  ? "Substituir Selecionados"
                  : "Restaurar Selecionados"}
              </span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
