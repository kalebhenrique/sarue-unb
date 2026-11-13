/**
 * Utilitário de detecção de plataforma e ambiente de execução.
 */

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
