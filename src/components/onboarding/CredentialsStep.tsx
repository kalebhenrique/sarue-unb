import React, { useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Lock } from 'lucide-react';
import { isMobileDevice } from '@/lib/platform';
import { PlatformAccountsAccordion } from './PlatformAccountsAccordion';

export interface CredentialsStepProps {
  onSuccess: () => void;
  /** Registra no wizard a ação de concluir (o botão Entrar vive no footer do wizard) */
  registerFinish?: (finish: () => Promise<void>) => void;
  /** Estado do passo para o chrome do wizard: há conta conectada? está ocupado? */
  onActiveChange?: (state: { connected: boolean; busy: boolean }) => void;
}

/**
 * Passo 4 do onboarding: título + accordion de plataformas compartilhado com a Settings.
 */
export const CredentialsStep: React.FC<CredentialsStepProps> = ({
  onSuccess,
  registerFinish,
  onActiveChange,
}) => {
  const reduced = useReducedMotion();
  const finishRef = useRef<() => Promise<void>>(async () => {});

  return (
    <div className="w-full">
      {/* Título do passo */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 26, delay: 0.05 }}
        className="mb-5"
      >
        <h2 className="text-2xl font-black tracking-tight text-black">Conecte suas plataformas</h2>
        <p className="text-sm font-medium text-neutral-600 mt-1 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
          Suas credenciais ficam no cofre local do seu {isMobileDevice() ? 'celular' : 'computador'}.
        </p>
      </motion.div>

      <PlatformAccountsAccordion
        showTeams={false}
        closeWhenAllConnected
        registerFinish={(finish) => {
          finishRef.current = finish;
          // A ação de concluir do wizard salva o que falta e entra no app
          registerFinish?.(async () => {
            await finishRef.current();
            onSuccess();
          });
        }}
        onActiveChange={onActiveChange}
      />
    </div>
  );
};
