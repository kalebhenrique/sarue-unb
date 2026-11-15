import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { GraduationCap } from 'lucide-react';
import {
  formatCpfDisplay,
  formatValidityDisplay,
  type StudentWalletState,
} from '@/hooks/useStudentWallet';

export type WalletCardId = 'ru' | 'bce';

export interface StudentCardModalProps {
  /** Cartão atualmente ampliado (`'ru' | 'bce'`), ou `null` quando fechado. */
  card: WalletCardId | null;
  /** Dados sincronizados da carteirinha estudantil e da BCE. */
  wallet: StudentWalletState;
  /** Callback acionado ao clicar no véu escuro ou pressionar Escape. */
  onClose: () => void;
}

/**
 * Modal em tela cheia para exibição da Carteirinha Estudantil UnB (PDF/QR RU)
 * ou Cartão BCE, reutilizado pela WalletScreen e atalhos como o FAB do RU.
 */
export const StudentCardModal: React.FC<StudentCardModalProps> = ({
  card,
  wallet,
  onClose,
}) => {
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (!card) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [card, onClose]);

  const ruQrValue =
    wallet.ruCardCode || wallet.matricula || 'UNB-SEM-MATRICULA';
  const bceQrValue = wallet.cpfDigits || '';

  const modalTree = (
    <AnimatePresence>
      {card && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={
            card === 'ru'
              ? 'Carteirinha Estudantil Oficial UnB em tela cheia'
              : 'Cartão Biblioteca Central BCE em tela cheia'
          }
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-ink/10 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden select-none"
        >
          {/* Cartão Vertical que gira 90° na transição de abertura: papel do modal —
              border-2, raio 8px, SEM sombra (A Regra do Popup de Papel); fecha por
              clique no véu, Esc ou gesto do sistema (sem X sobre o cartão) */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{
              scale: 0.72,
              rotate: shouldReduceMotion ? 0 : -90,
              opacity: 0,
            }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{
              scale: shouldReduceMotion ? 0.9 : 0.72,
              rotate: 0,
              opacity: 0,
            }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative w-full max-w-md max-h-[88dvh] bg-paper border-2 border-ink rounded-lg shadow-none overflow-hidden flex flex-col shrink-0"
          >
            {/* Barra Superior Limpa fixa no topo do cartão vertical */}
            <div
              className={`px-4 py-3 border-b-2 border-black flex items-center gap-2.5 text-white shrink-0 ${
                card === 'ru' ? 'bg-neo-blue' : 'bg-unb-green'
              }`}
            >
              <GraduationCap className="w-5 h-5 shrink-0 stroke-[2.5]" />
              <p className="text-xs sm:text-sm font-black uppercase tracking-wider truncate">
                {card === 'ru'
                  ? 'Carteirinha Estudantil Oficial UnB'
                  : 'Biblioteca Central • BCE UnB'}
              </p>
            </div>

            {/* Corpo Principal em Tela Cheia Vertical */}
            {card === 'ru' &&
            (wallet.renderedCardDataUrl || wallet.renderedFullPageDataUrl) ? (
              <div className="flex-1 bg-white flex items-center justify-center min-h-0 overflow-auto">
                <img
                  src={
                    wallet.renderedCardDataUrl ??
                    wallet.renderedFullPageDataUrl ??
                    ''
                  }
                  alt="Carteirinha Estudantil Oficial da UnB (PDF SIGAA)"
                  className="block max-w-full max-h-[84dvh] w-auto h-auto object-contain bg-white"
                />
              </div>
            ) : (
              <div className="flex-1 px-5 py-6 flex flex-col items-center justify-between gap-5 min-h-0 overflow-y-auto">
                {/* Bloco QR Code Centralizado de Alto Contraste para Leitor Óptico */}
                <div className="shrink-0 flex flex-col items-center justify-center gap-2 pt-1">
                  <div className="p-4 bg-white border-2 border-black rounded-2xl shadow-neo-sm flex items-center justify-center">
                    {card === 'ru' ? (
                      <QRCodeSVG
                        value={ruQrValue}
                        size={220}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                        level="M"
                      />
                    ) : bceQrValue ? (
                      <QRCodeSVG
                        value={bceQrValue}
                        size={220}
                        bgColor="#FFFFFF"
                        fgColor="#000000"
                        level="M"
                      />
                    ) : (
                      <div className="w-52 h-52 flex items-center justify-center text-center p-4">
                        <p className="text-xs font-black text-black">
                          CPF não encontrado. Sincronize pela barra principal.
                        </p>
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-black font-mono text-black tracking-wider">
                    {card === 'ru'
                      ? wallet.ruCardCode || wallet.matricula
                      : wallet.cpfDigits || 'CPF INDISPONÍVEL'}
                  </span>
                </div>

                {/* Dados do Discente empilhados verticalmente */}
                <div className="w-full space-y-3 pt-4 border-t-2 border-black/15">
                  <div className="space-y-0.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                      Nome do Estudante
                    </p>
                    <p
                      className={`text-base sm:text-lg font-black text-black leading-tight line-clamp-2 ${card === 'bce' ? 'uppercase' : ''}`}
                    >
                      {wallet.studentName}
                    </p>
                  </div>

                  {card === 'ru' ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                          Matrícula
                        </p>
                        <p className="text-sm font-black font-mono text-black">
                          {wallet.matricula || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                          Validade
                        </p>
                        <p className="text-sm font-black text-black">
                          {formatValidityDisplay(wallet.ruCardValidity)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                        CPF (Catraca BCE)
                      </p>
                      <p className="text-sm font-black font-mono text-black">
                        {formatCpfDisplay(wallet.cpfDigits)}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                      Curso • {wallet.level}
                    </p>
                    <p className="text-xs sm:text-sm font-black text-black truncate">
                      {wallet.courseName}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') {
    return modalTree;
  }

  return createPortal(modalTree, document.body);
};
