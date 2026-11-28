import React, { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { PlatformAccountsAccordion } from "@/components/onboarding/PlatformAccountsAccordion";
import { TranscriptImportDropzone } from "@/components/onboarding/TranscriptImportDropzone";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { useCredentials } from "@/hooks/useCredentials";
import { useContainer } from "@/context/ContainerContext";
import type { StudentAcademicProfile } from "@/core";

export interface ConnectedAccountsCardProps {
  onTranscriptImported?: (profile: StudentAcademicProfile) => void;
}

export const ConnectedAccountsCard: React.FC<ConnectedAccountsCardProps> = ({
  onTranscriptImported,
}) => {
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
            onImported={({ profile }) => {
              setLocalProfile(profile);
              onTranscriptImported?.(profile);
            }}
          />
        )}
      </div>
    </SettingsSection>
  );
};
