import React, { useEffect } from "react";
import { ArrowLeft, RotateCwClock } from "lucide-react";
import {
  Badge,
  Button,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import { PATCH_NOTES, type PatchNotesEntry } from "@/content/patchNotes";
import { cn } from "@/lib/utils";

export interface PatchNotesViewProps {
  onBack: () => void;
  /** Versão atualmente instalada, sem o prefixo "v" (ex.: "0.1.0"). */
  currentVersion: string;
}

/** Selo de versão: adesivo pill com borda preta e sombra dura de ação. */
const versionPillClass =
  "inline-flex items-center rounded-full border-2 border-ink bg-paper px-3.5 py-1 text-sm font-extrabold text-black shadow-[2px_2px_0px_0px_var(--neo-shadow)]";

const PatchNotesEntryItem: React.FC<{
  entry: PatchNotesEntry;
  isCurrent: boolean;
}> = ({ entry, isCurrent }) => (
  <section className="border-b-2 border-ink/15 pb-6 last:border-b-0 space-y-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          versionPillClass,
          // Adesivo de destaque nos dois temas: cheio com tinta fixa de texto
          // (no escuro, o ouro vivo remapado no .dark).
          isCurrent && "bg-neo-yellow text-ink",
        )}
      >
        v{entry.version}
      </span>
      {isCurrent && (
        <Badge variant="success" size="sm">
          Versão Atual
        </Badge>
      )}
      <span className="ml-auto text-xs font-bold text-neutral-500">
        {entry.date}
      </span>
    </div>

    <h3 className="text-base md:text-lg font-black tracking-tight text-black">
      {entry.title}
    </h3>

    <ul className="space-y-1.5 pt-0.5">
      {entry.items.map((item, index) => (
        <li key={index} className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-[2px] bg-black"
          />
          <span className="text-xs md:text-sm font-semibold leading-relaxed text-neutral-800">
            {item}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

export const PatchNotesView: React.FC<PatchNotesViewProps> = ({
  onBack,
  currentVersion,
}) => {
  useEffect(() => {
    // Rola o container scrollável da aplicação (<main>) para o topo
    const mainEl = document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: "instant" });
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  return (
    <PageContainer>
      <PageHeader
        icon={RotateCwClock}
        title="Novidades e Patch Notes"
        onBack={onBack}
        backLabel="Voltar para Configurações"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Voltar</span>
          </Button>
        }
      />

      <div className={cn("w-full max-w-3xl space-y-6")}>
        {PATCH_NOTES.map((entry) => (
          <PatchNotesEntryItem
            key={entry.version}
            entry={entry}
            isCurrent={entry.version === currentVersion}
          />
        ))}
      </div>
    </PageContainer>
  );
};
