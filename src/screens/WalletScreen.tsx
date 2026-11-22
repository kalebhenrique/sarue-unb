import React, { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  IdCard,
  BookOpenCheck,
  Maximize2,
  Receipt,
  FileText,
} from "lucide-react";
import {
  useStudentWallet,
  formatValidityDisplay,
  formatCurrencyBrl,
} from "../hooks/useStudentWallet";
import { useCredentials } from "../hooks/useCredentials";
import { PageHeader } from "@/components/ui/page-header";
import {
  StudentCardModal,
  type WalletCardId,
} from "@/components/wallet/StudentCardModal";
import { WalletSkeleton } from "@/components/wallet/WalletSkeleton";

/**
 * Garante que a imagem renderizada da carteirinha fique sempre em orientação
 * horizontal ("deitada") no PREVIEW. No modal ela gira para ficar em pé
 * (a imagem crua já é portrait; o giro de entrada -90°→0 faz o levantar).
 */
function toLandscapeCardDataUrl(dataUrl: string): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    return Promise.resolve(dataUrl);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h || w >= h) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = h;
      canvas.height = w;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.translate(0, w);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export const WalletScreen: React.FC = () => {
  const { wallet, isLoading } = useStudentWallet();
  const { hasCredentials, isLoading: isCheckingAuth } = useCredentials();
  const isLoggedIn = Boolean(hasCredentials);
  const isInitialLoad = isLoading || isCheckingAuth;
  const [expandedCard, setExpandedCard] = useState<WalletCardId | null>(null);
  const [landscapeCard, setLandscapeCard] = useState<{
    source: string;
    dataUrl: string;
  } | null>(null);

  useEffect(() => {
    const source = wallet.renderedCardDataUrl;
    if (!source) return;
    let cancelled = false;
    void toLandscapeCardDataUrl(source).then((oriented) => {
      if (!cancelled) {
        setLandscapeCard({ source, dataUrl: oriented });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wallet.renderedCardDataUrl]);

  const displayCardDataUrl =
    wallet.renderedCardDataUrl &&
    landscapeCard?.source === wallet.renderedCardDataUrl
      ? landscapeCard.dataUrl
      : wallet.renderedCardDataUrl;

  const bceQrValue = wallet.cpfDigits || "";
  const hasOfficialPdf = Boolean(
    wallet.renderedCardDataUrl || wallet.ruCardPdfBase64,
  );

  const interactiveCardClasses = isLoggedIn
    ? "cursor-pointer transition-[transform,box-shadow] duration-150 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-neo-xs md:hover:translate-x-[2px] md:hover:translate-y-[2px] md:hover:shadow-neo-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none md:active:translate-x-[4px] md:active:translate-y-[4px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neo-blue"
    : "cursor-default";

  return (
    <div className="max-w-4xl mx-auto pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-12 space-y-5">
      {/* PageHeader padrão do sistema (sem card, sem ícone; fonte menor no mobile) */}
      <PageHeader title="Carteirinha Estudantil" />

      {isInitialLoad ? (
        <WalletSkeleton />
      ) : (
        <>
          {/* Pilha de Cartões Horizontais Estilo Samsung Wallet */}
      <section
        aria-label="Cartões estudantis"
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        {/* CARTÃO 1: Carteirinha Estudantil Oficial em PDF (SIGAA UnB / Cinema / RU) */}
        <button
          type="button"
          disabled={!isLoggedIn}
          onClick={isLoggedIn ? () => setExpandedCard("ru") : undefined}
          aria-label="Abrir Carteirinha Estudantil Oficial em PDF em tela cheia"
          className={`group relative w-full text-left bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo overflow-hidden flex flex-col justify-between ${interactiveCardClasses}`}
        >
          {/* Faixa Superior Institucional UnB */}
          <div className="bg-neo-blue text-white px-4 py-2.5 border-b-2 border-ink flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <IdCard className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span className="text-xs font-black uppercase tracking-wider truncate">
                Carteirinha
              </span>
            </div>
            {isLoggedIn && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-ink border-2 border-ink text-xs font-extrabold uppercase tracking-wide shrink-0">
                <Maximize2 className="w-3 h-3 stroke-[2.5]" />
                <span>Ampliar</span>
              </span>
            )}
          </div>

          {/* Corpo: PDF Oficial do SIGAA deitado (landscape) no preview; no modal ele gira pra ficar em pé */}
          {displayCardDataUrl ? (
            <div className="h-52 bg-white flex flex-col">
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <img
                  src={displayCardDataUrl}
                  alt="Carteirinha Estudantil Oficial da UnB emitida pelo SIGAA"
                  className="block max-h-full max-w-full object-contain bg-white"
                />
              </div>
              {wallet.ruBalance && (
                <div className="w-full flex items-center justify-end px-3 pb-2">
                  <span className="text-xs font-black text-ink">
                    Saldo RU: {wallet.ruBalance}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-52 p-4 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-3 min-w-0">
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                      Discente
                    </p>
                    <p className="text-sm sm:text-base font-black text-black leading-tight line-clamp-1">
                      {wallet.studentName}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                        Matrícula
                      </p>
                      <p className="text-xs sm:text-sm font-black font-mono text-black">
                        {wallet.matricula || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                        Validade
                      </p>
                      <p className="text-xs sm:text-sm font-black text-black">
                        {formatValidityDisplay(wallet.ruCardValidity)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                      Curso • {wallet.level}
                    </p>
                    <p className="text-xs font-extrabold text-neutral-700 truncate">
                      {wallet.courseName}
                    </p>
                  </div>
                </div>

                <div
                  aria-hidden="true"
                  className="w-14 h-14 rounded-xl bg-pastel-blue border-2 border-ink flex items-center justify-center shrink-0"
                >
                  <IdCard className="w-7 h-7 stroke-[2.25] text-blue-ink" />
                </div>
              </div>

              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-neo-yellow text-ink border-2 border-ink text-xs font-black">
                <FileText className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                <span className="truncate">
                  {hasOfficialPdf
                    ? "PDF Oficial Disponível"
                    : isLoggedIn
                      ? "Sincronize para baixar o PDF oficial da carteirinha"
                      : "Conecte o SIGAA em Configurações para emitir sua carteirinha"}
                </span>
              </div>
            </div>
          )}
        </button>

        {/* CARTÃO 2: Cartão Biblioteca Central (BCE UnB — QR Code CPF tipo texto) */}
        <button
          type="button"
          disabled={!isLoggedIn}
          onClick={isLoggedIn ? () => setExpandedCard("bce") : undefined}
          aria-label="Abrir Cartão da Biblioteca Central BCE em tela cheia"
          className={`group relative w-full text-left bg-paper border-2 border-ink rounded-lg shadow-neo-sm md:shadow-neo overflow-hidden flex flex-col justify-between ${interactiveCardClasses}`}
        >
          {/* Faixa Superior BCE */}
          <div className="bg-unb-green text-white px-4 py-2.5 border-b-2 border-ink flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <BookOpenCheck className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span className="text-xs font-black uppercase tracking-wider truncate">
                QR Code BCE
              </span>
            </div>
            {isLoggedIn && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white text-ink border-2 border-ink text-xs font-extrabold uppercase tracking-wide shrink-0">
                <Maximize2 className="w-3 h-3 stroke-[2.5]" />
                <span>Ampliar</span>
              </span>
            )}
          </div>

          {/* Corpo Horizontal do Cartão BCE */}
          <div className="h-52 p-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                  Nome do Estudante
                </p>
                <p className="text-sm sm:text-base font-black text-black leading-tight line-clamp-2 uppercase">
                  {wallet.studentName}
                </p>
              </div>

              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                  CPF (Catraca BCE)
                </p>
                <p className="text-xs sm:text-sm font-black font-mono text-black">
                  {wallet.cpfDigits ? `${wallet.cpfDigits.slice(0, 3)}.***` : "—"}
                </p>
              </div>

              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-neutral-500">
                  Curso • {wallet.level}
                </p>
                <p className="text-xs font-extrabold text-neutral-700 truncate">
                  {wallet.courseName}
                </p>
              </div>
            </div>

            {/* Mini QR Code CPF em moldura branca (Quiet Zone p-4 + fundo #FFFFFF) */}
            <div className="shrink-0 flex flex-col items-center gap-1">
              <div className="p-4 bg-white border-2 border-ink rounded-xl shadow-neo-xs flex items-center justify-center">
                {bceQrValue ? (
                  <QRCodeSVG
                    value={bceQrValue}
                    size={76}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    level="M"
                  />
                ) : (
                  <div className="w-[76px] h-[76px] flex items-center justify-center">
                    <p className="text-[10px] leading-tight font-extrabold text-ink text-center">
                      Sincronize para ler o CPF
                    </p>
                  </div>
                )}
              </div>
              <span className="text-xs font-black font-mono text-neutral-500">
                Catraca BCE
              </span>
            </div>
          </div>
        </button>
      </section>

      {/* Seção de Saldo e Extrato no Restaurante Universitário */}
      <section
        aria-label="Saldo e extrato no Restaurante Universitário"
        className="bg-paper border-2 border-ink rounded-2xl p-4 sm:p-5 shadow-neo-sm md:shadow-neo space-y-3"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-neo-yellow text-ink border-2 border-ink flex items-center justify-center shrink-0">
              <Receipt className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-black">
                Extrato no Restaurante Universitário
              </h2>
              <p className="text-xs font-bold text-neutral-500">
                {wallet.ruGroup
                  ? `Grupo tarifário: ${wallet.ruGroup}`
                  : "Sincronizado junto com o botão Sincronizar da barra principal"}
              </p>
            </div>
          </div>

          {wallet.ruBalance && (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-pastel-green border-2 border-ink self-start sm:self-auto">
              <span className="text-xs font-extrabold text-neutral-600">
                Saldo atual:
              </span>
              <span className="text-sm font-black text-black">
                {wallet.ruBalance}
              </span>
            </div>
          )}
        </div>

        {wallet.statement.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-xs font-bold text-neutral-500">
              Nenhuma movimentação sincronizada ainda. Use o botão Sincronizar
              do menu principal para atualizar.
            </p>
          </div>
        ) : (
          <div className="divide-y-2 divide-black/10">
            {wallet.statement.slice(0, 12).map((entry, idx) => (
              <div
                key={`${entry.occurredAt}-${idx}`}
                className="py-2 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-black text-black truncate">
                    {entry.description}
                  </p>
                  <p className="text-xs font-semibold text-neutral-500">
                    {entry.occurredAt}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-black text-black">
                    {formatCurrencyBrl(entry.amount) ?? "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal Tela Cheia Vertical com Animação de Giro 90° (UnB e BCE) */}
      <StudentCardModal
        card={isLoggedIn ? expandedCard : null}
        wallet={wallet}
        onClose={() => setExpandedCard(null)}
      />
        </>
      )}
    </div>
  );
};
