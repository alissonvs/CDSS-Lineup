import React, { useState } from 'react';
import type { NavioLineup, StatusCor } from '../types';
import {
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  PlusCircle,
  CloudRain,
  Search
} from 'lucide-react';

interface AdminQueueProps {
  navios: NavioLineup[];
  onReorder: (ids: number[]) => void;
  onToggleLivrePratica?: (navio: NavioLineup) => void;
  onChangeStatus?: (navio: NavioLineup, novoStatus: StatusCor) => void;
  onEditNavio: (navio: NavioLineup) => void;
  onDeleteNavio: (navio: NavioLineup) => void;
  onOpenNewNavioModal: () => void;
  isProcessing: boolean;
}

export const AdminQueue: React.FC<AdminQueueProps> = ({
  navios,
  onReorder,
  onEditNavio,
  onDeleteNavio,
  onOpenNewNavioModal,
  isProcessing
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  // Move navio para cima na prioridade
  const handleMoveUp = (index: number) => {
    if (index === 0 || isProcessing) return;
    const newOrder = [...navios];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index - 1];
    newOrder[index - 1] = temp;
    onReorder(newOrder.map((n) => n.id));
  };

  // Move navio para baixo na prioridade
  const handleMoveDown = (index: number) => {
    if (index === navios.length - 1 || isProcessing) return;
    const newOrder = [...navios];
    const temp = newOrder[index];
    newOrder[index] = newOrder[index + 1];
    newOrder[index + 1] = temp;
    onReorder(newOrder.map((n) => n.id));
  };

  const getStatusBadge = (status: StatusCor) => {
    switch (status) {
      case 'VERDE':
        // Operando Real
        return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40';
      case 'CINZA':
        // Liberado
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40';
      case 'VERMELHO':
        // Fundeio Real
        return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40';
      case 'LARANJA':
        // Fundeio Previsto
        return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40';
      case 'AZUL':
        // Previsão de Operação
        return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40';
    }
  };

  const filteredNavios = navios.filter((n) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      n.nome_navio.toLowerCase().includes(term) ||
      n.imo.toLowerCase().includes(term) ||
      n.mercadoria.toLowerCase().includes(term) ||
      (n.agencia && n.agencia.toLowerCase().includes(term))
    );
  });

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-slate-50 dark:bg-cco-darkest overflow-hidden p-4 md:p-6 transition-colors">
      {/* Topo do painel */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center space-x-2">
            <span>Sequenciamento de Fila & Controle de Prática</span>
            <span className="text-xs font-mono bg-blue-50 dark:bg-cyan-500/20 text-blue-700 dark:text-cyan-400 px-2 py-0.5 rounded border border-blue-200 dark:border-cyan-500/30">
              {navios.length} Embarcações
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Use as setas [▲] e [▼] para reorganizar a fila. O motor recalcula instantaneamente as janelas de berço sem colisão temporal.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar navio, IMO ou carga..."
              className="pl-8 pr-3 py-1.5 bg-white dark:bg-cco-panel border border-slate-300 dark:border-cco-border rounded-lg text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-600 dark:focus:border-cyan-500 w-56 md:w-64 transition-colors"
            />
          </div>

          <button
            onClick={onOpenNewNavioModal}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Cadastrar Nova Escala</span>
          </button>
        </div>
      </div>

      {/* Tabela de Escalas da CCO */}
      <div className="flex-1 bg-white dark:bg-cco-panel border border-slate-200 dark:border-cco-border rounded-xl shadow-sm dark:shadow-xl overflow-hidden flex flex-col transition-colors">
        <div className="overflow-x-auto overflow-y-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-cco-bg border-b border-slate-200 dark:border-cco-border text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px] sticky top-0 z-10">
                <th className="py-3 px-3 text-center w-20">Fila</th>
                <th className="py-3 px-3">Embarcação / IMO</th>
                <th className="py-3 px-3">Carga & Volume</th>
                <th className="py-3 px-3">Dimensões</th>
                <th className="py-3 px-3">Status Operacional</th>
                <th className="py-3 px-3">Janela Projetada</th>
                <th className="py-3 px-3 text-center w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-cco-border/50 text-slate-700 dark:text-slate-300 font-medium">
              {filteredNavios.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Nenhuma embarcação encontrada com o termo "{searchTerm}".
                  </td>
                </tr>
              ) : (
                filteredNavios.map((navio, index) => {
                const isOperating = navio.status_cor === 'VERDE';

                return (
                  <tr
                    key={navio.id}
                    className={`hover:bg-slate-50 dark:hover:bg-cco-hover/40 transition-colors ${
                      isOperating ? 'bg-emerald-50/60 dark:bg-emerald-950/15' : ''
                    }`}
                  >
                    {/* Botões de Prioridade Fila [▲ / ▼] */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <span
                          className={`w-6 h-6 rounded flex items-center justify-center font-bold text-xs ${
                            isOperating
                              ? 'bg-emerald-600 text-white font-extrabold shadow-sm shadow-emerald-600/40'
                              : 'bg-slate-100 dark:bg-cco-darkest text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-cco-border'
                          }`}
                        >
                          {navio.ordem_fila}
                        </span>

                        <div className="flex flex-col space-y-0.5 ml-1">
                          <button
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0 || isProcessing}
                            title="Subir prioridade na fila"
                            className="p-1 rounded bg-slate-100 dark:bg-cco-darkest hover:bg-blue-600 dark:hover:bg-cyan-600 hover:text-white text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:hover:bg-slate-100 dark:disabled:hover:bg-cco-darkest transition-colors cursor-pointer"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleMoveDown(index)}
                            disabled={index === navios.length - 1 || isProcessing}
                            title="Descer prioridade na fila"
                            className="p-1 rounded bg-slate-100 dark:bg-cco-darkest hover:bg-blue-600 dark:hover:bg-cyan-600 hover:text-white text-slate-500 dark:text-slate-400 disabled:opacity-30 disabled:hover:bg-slate-100 dark:disabled:hover:bg-cco-darkest transition-colors cursor-pointer"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Dados do Navio */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center space-x-2">
                        <div>
                          <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
                            <span>{navio.nome_navio}</span>
                            {isOperating && (
                              <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.2 rounded font-black tracking-wide flex items-center space-x-1">
                                <span>BERÇO</span>
                                {navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
                                  <span>• {navio.progresso_operacao.toFixed(1).replace('.', ',')}%</span>
                                )}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            IMO {navio.imo} &bull; {navio.agencia || 'Agência N/I'}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Carga & Volume */}
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-blue-700 dark:text-cyan-300 block">{navio.mercadoria}</span>
                      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        {navio.volume_t.toLocaleString('pt-BR')} t
                      </span>
                      {isOperating && navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
                        <div className="mt-1">
                          <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                            Progresso: {navio.progresso_operacao.toFixed(1).replace('.', ',')}%
                          </span>
                          <div className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-0.5">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, navio.progresso_operacao))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Dimensões */}
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      <div className="text-slate-700 dark:text-slate-300">LOA: {navio.loa} m</div>
                      <div className="text-slate-500 dark:text-slate-400">DWT: {navio.dwt.toLocaleString('pt-BR')}</div>
                    </td>

                    {/* Status Operacional Automático (Somente Leitura) */}
                    <td className="py-2.5 px-3">
                      <div
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border ${getStatusBadge(
                          navio.status_cor
                        )}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            navio.status_cor === 'VERDE'
                              ? 'bg-emerald-600 dark:bg-emerald-400 animate-pulse'
                              : navio.status_cor === 'VERMELHO'
                              ? 'bg-rose-600 dark:bg-rose-400'
                              : navio.status_cor === 'CINZA'
                              ? 'bg-slate-500 dark:bg-slate-300'
                              : 'bg-amber-500 dark:bg-amber-400'
                          }`}
                        ></span>
                        <span>
                          {navio.status_cor === 'VERDE'
                            ? 'Operando no Berço'
                            : navio.status_cor === 'VERMELHO'
                            ? 'No Fundeio Real (AIS)'
                            : navio.status_cor === 'CINZA'
                            ? 'Liberado Autoridades'
                            : 'Fundeio Previsto (ETA)'}
                        </span>
                      </div>
                    </td>

                    {/* Janela Projetada de Berço */}
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      <div className="text-slate-900 dark:text-slate-200">
                        {navio.inicio_atracacao
                          ? new Date(navio.inicio_atracacao).toLocaleDateString('pt-BR') + ' ' + new Date(navio.inicio_atracacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          : '-'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 flex items-center space-x-1">
                        <span>{navio.duracao_estimada_horas}h berço</span>
                        {navio.horas_chuva && navio.horas_chuva > 0 ? (
                          <span className="text-blue-600 dark:text-sky-400 flex items-center">
                            <CloudRain className="w-3 h-3 ml-1" />
                            <span>+{navio.horas_chuva}h</span>
                          </span>
                        ) : null}
                      </div>
                    </td>

                    {/* Botões de Ação */}
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => onEditNavio(navio)}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-cco-darkest hover:bg-blue-600 dark:hover:bg-cyan-600 text-slate-600 dark:text-slate-300 hover:text-white transition-colors border border-slate-200 dark:border-cco-border cursor-pointer"
                          title="Editar escala"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteNavio(navio)}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-cco-darkest hover:bg-rose-600 text-slate-600 dark:text-slate-300 hover:text-white transition-colors border border-slate-200 dark:border-cco-border cursor-pointer"
                          title={`Excluir escala de ${navio.nome_navio}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
