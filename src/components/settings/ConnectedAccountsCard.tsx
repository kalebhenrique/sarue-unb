import React, { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { PlatformAccountsAccordion } from "@/components/onboarding/PlatformAccountsAccordion";
import { TranscriptImportDropzone } from "@/components/onboarding/TranscriptImportDropzone";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useCredentials } from "@/hooks/useCredentials";
import { useContainer } from "@/context/ContainerContext";
import type { StudentAcademicProfile } from "@/core";

/**
 * Seção "Contas conectadas" de Configurações: o accordion de gavetas do
 * cofre dentro do card padrão da página (variante "panel" — linhas
 * segmentadas, sem sombra própria, para o card não aninhar adesivos,
 * com inputs em linha no desktop e coluna em telas menores).
 * Quando não há conta SIGAA conectada, exibe também a importação local
 * de histórico escolar em PDF.
 */
export const ConnectedAccountsCard: React.FC = () => {
  const { allCredentials } = useCredentials();
  const { repos } = useContainer();
  const hasSigaa = Boolean(allCredentials.sigaa);
  const [localProfile, setLocalProfile] =
    useState<StudentAcademicProfile | null>(null);

  useEffect(() => {
    if (hasSigaa) return;
    let cancelled = false;
    void repos.academicProfileRepo
      .getProfile()
      .then((profile) => {
        if (!cancelled) setLocalProfile(profile);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasSigaa, repos.academicProfileRepo]);

  return (
    <SettingsSection icon={KeyRound} label="Contas conectadas">
      <div className="space-y-3">
        <PlatformAccountsAccordion
          variant="panel"
          animated={false}
          initialOpenPlatform={null}
          allowAllClosed
        />
        {!hasSigaa && (
          <TranscriptImportDropzone
            variant="compact"
            initialProfile={localProfile}
            onImported={({ profile }) => setLocalProfile(profile)}
          />
        )}
      </div>
    </SettingsSection>
  );
};
