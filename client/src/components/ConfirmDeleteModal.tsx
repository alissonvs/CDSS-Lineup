import React from 'react';
import type { NavioLineup } from '../types';
import { AlertTriangle, Trash2, X, Ship, Package, Calendar } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  navio: NavioLineup | null;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  navio,
  isDeleting,
  onClose,
  onConfirm
}) => {
  if (!isOpen || !navio) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-cco-panel border border-slate-200 dark:border-cco-border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-xs text-slate-800 dark:text-slate-200 animate-in zoom-in-95 duration-150 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header com ícone de alerta */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-cco-bg border-b border-slate-200 dark:border-cco-border flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-600/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Excluir Escala do Line-Up
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Porto de São Sebastião &bull; CDSS
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-cco-hover text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-4">
          <p className="text-slate-700 dark:text-slate-300 text-sm">
            Tem certeza que deseja remover esta embarcação da programação de atracação?
          </p>

          {/* Card Resumo do Navio */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Ship className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                <span className="font-bold text-slate-900 dark:text-white text-sm tracking-wide">
                  {navio.nome_navio}
                </span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                IMO {navio.imo}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-cco-border/50">
              <div className="flex items-center space-x-1.5">
                <Package className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>
                  <strong className="text-slate-800 dark:text-slate-300">{navio.mercadoria}</strong> ({navio.volume_t.toLocaleString('pt-BR')} t)
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                <span>
                  Posição Fila: <strong className="text-amber-600 dark:text-amber-400">#{navio.ordem_fila}</strong>
                </span>
              </div>
            </div>

            {navio.agencia && (
              <div className="text-[10px] text-slate-500 truncate">
                Agência: {navio.agencia}
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-[11px] leading-relaxed">
            <strong>Atenção:</strong> Esta ação reordenará a fila de atracação e recalculará as janelas operacionais de todos os demais navios.
          </div>
        </div>

        {/* Rodapé de Ações */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-cco-bg border-t border-slate-200 dark:border-cco-border flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-lg bg-white dark:bg-cco-panel hover:bg-slate-100 dark:hover:bg-cco-hover text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-cco-border transition-colors font-semibold disabled:opacity-40 cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/30 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Excluindo...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                <span>Sim, Excluir Escala</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
