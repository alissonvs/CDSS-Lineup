import React, { useState, useEffect } from 'react';
import type { NavioLineup } from '../types';
import { syncDataDocked, searchNavioCatalogo } from '../services/api';
import { verificarDivergenciaEta, formatarDataBr } from '../utils/etaValidation';
import {
  X,
  Sparkles,
  Ship,
  CheckCircle,
  AlertCircle,
  Search,
  Check
} from 'lucide-react';

interface NavioModalProps {
  isOpen: boolean;
  navioParaEditar: NavioLineup | null;
  onClose: () => void;
  onSave: (navioData: Partial<NavioLineup>) => Promise<void>;
}

export const NavioModal: React.FC<NavioModalProps> = ({
  isOpen,
  navioParaEditar,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<Partial<NavioLineup>>({
    imo: '',
    nome_navio: '',
    tipo_navio: 'Graneleiro',
    mercadoria: 'Barrilha',
    volume_t: 15000,
    loa: 170.0,
    dwt: 25000,
    calado: 8.5,
    agencia: '',
    status_cor: 'LARANJA',
    livre_pratica_ok: 0,
    armazem_publico: 0,
    eta_previsto: '',
    chegada_fundeio: '',
    latitude: -23.8045,
    longitude: -45.3970
  });

  const [isSearchingCatalogo, setIsSearchingCatalogo] = useState(false);
  const [catalogoMessage, setCatalogoMessage] = useState<string | null>(null);
  const [isSearchingDataDocked, setIsSearchingDataDocked] = useState(false);
  const [dataDockedMessage, setDataDockedMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (navioParaEditar) {
      setFormData({ ...navioParaEditar });
    } else {
      setFormData({
        imo: '',
        nome_navio: '',
        tipo_navio: 'Graneleiro',
        mercadoria: 'Barrilha',
        volume_t: 18000,
        loa: 175.0,
        dwt: 28000,
        calado: 9.0,
        agencia: '',
        status_cor: 'LARANJA',
        livre_pratica_ok: 0,
        armazem_publico: 0,
        eta_previsto: '2026-09-20T14:00',
        latitude: -23.8045,
        longitude: -45.3970
      });
    }
    setDataDockedMessage(null);
    setCatalogoMessage(null);
    setError(null);
  }, [navioParaEditar, isOpen]);

  if (!isOpen) return null;

  // Consulta automática no Catálogo Oficial de Navios pelo nome
  const handleCatalogoLookup = async (manualName?: string) => {
    const nome = (manualName !== undefined ? manualName : formData.nome_navio || '').trim();
    if (!nome || nome.length < 2) {
      setError('Por favor, informe o nome da embarcação para consultar o IMO no catálogo.');
      return;
    }

    setIsSearchingCatalogo(true);
    setError(null);
    setCatalogoMessage(null);

    try {
      const vessel = await searchNavioCatalogo(nome);
      setFormData((prev) => ({
        ...prev,
        imo: vessel.imo,
        tipo_navio: vessel.tipo_cdss || vessel.vessel_type || prev.tipo_navio,
        loa: vessel.loa || prev.loa,
        dwt: vessel.dwt || prev.dwt,
        calado: vessel.calado ? Number(vessel.calado.toFixed(1)) : prev.calado
      }));
      setCatalogoMessage(`IMO ${vessel.imo} identificado no Catálogo Oficial (${vessel.name || vessel.nome})!`);
    } catch (err) {
      setError(`Catálogo: ${(err as Error).message}`);
    } finally {
      setIsSearchingCatalogo(false);
    }
  };

  // Busca no DataDocked (sob demanda)
  const handleDataDockedLookup = async () => {
    if (!formData.imo || formData.imo.trim().length < 5) {
      setError('Por favor, digite um número de IMO válido para consulta no DataDocked.');
      return;
    }

    setIsSearchingDataDocked(true);
    setError(null);
    setDataDockedMessage(null);

    try {
      const { vessel } = await syncDataDocked(formData.imo.trim(), navioParaEditar?.id);
      setFormData((prev) => ({
        ...prev,
        nome_navio: prev.nome_navio || vessel.nome_navio,
        tipo_navio: prev.tipo_navio || vessel.tipo_navio,
        mercadoria: prev.mercadoria || vessel.mercadoria,
        volume_t: prev.volume_t || vessel.volume_t,
        agencia: prev.agencia || vessel.agencia,
        loa: prev.loa || vessel.loa,
        dwt: prev.dwt || vessel.dwt,
        calado: prev.calado || (vessel.calado ? Number(vessel.calado.toFixed(1)) : undefined),
        eta_ais: vessel.eta_previsto ? vessel.eta_previsto.slice(0, 16) : prev.eta_ais,
        latitude: vessel.latitude,
        longitude: vessel.longitude
      }));
      const latStr = vessel.latitude !== undefined ? vessel.latitude.toFixed(4) : '';
      const lonStr = vessel.longitude !== undefined ? vessel.longitude.toFixed(4) : '';
      const navStatusStr = vessel.navigationalStatus ? ` • ${vessel.navigationalStatus}` : '';
      const nowStr =
        new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' às ' +
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setDataDockedMessage(`AIS atualizado via DataDocked: Lat ${latStr}, Lon ${lonStr}${navStatusStr} • ${nowStr} (1 Crédito)`);
    } catch (err) {
      setError(`Falha ao sincronizar com DataDocked: ${(err as Error).message}`);
    } finally {
      setIsSearchingDataDocked(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let currentImo = formData.imo?.trim();
    const currentNome = formData.nome_navio?.trim();

    if (!currentNome || !formData.mercadoria || !formData.volume_t) {
      setError('Preencha os campos obrigatórios (Nome da Embarcação, Mercadoria e Volume).');
      return;
    }

    // Se o IMO não foi preenchido, consulta automaticamente no Catálogo Oficial antes de salvar
    if (!currentImo && currentNome) {
      setIsSearchingCatalogo(true);
      try {
        const vessel = await searchNavioCatalogo(currentNome);
        if (vessel?.imo) {
          currentImo = vessel.imo;
          formData.imo = vessel.imo;
        }
      } catch {
        // Fallback handled by backend
      } finally {
        setIsSearchingCatalogo(false);
      }
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-cco-panel border border-slate-200 dark:border-cco-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs text-slate-800 dark:text-slate-200 transition-colors">
        {/* Header do Modal */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-cco-bg border-b border-slate-200 dark:border-cco-border flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-blue-50 dark:bg-cyan-600/20 text-blue-600 dark:text-cyan-400 border border-blue-200 dark:border-cyan-500/30">
              <Ship className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {navioParaEditar ? `Editar Escala: ${navioParaEditar.nome_navio}` : 'Cadastrar Nova Escala no Line-Up'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Porto de São Sebastião &bull; CDSS Berço Único
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-cco-hover text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Formulário */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-500/40 text-rose-800 dark:text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {catalogoMessage && (
            <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{catalogoMessage}</span>
            </div>
          )}

          {dataDockedMessage && (
            <div className="p-3 rounded-lg bg-cyan-950/50 border border-cyan-500/40 text-cyan-300 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>{dataDockedMessage}</span>
            </div>
          )}

          {/* Destaque 1: Nome da Embarcação com Busca Automática de IMO no Catálogo Oficial */}
          <div className="bg-slate-50 dark:bg-cco-darkest p-4 rounded-xl border border-indigo-200 dark:border-indigo-500/40 shadow-sm dark:shadow-inner space-y-2 transition-colors">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 dark:text-slate-200 font-bold flex items-center space-x-2 text-xs">
                <Ship className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                <span>Nome da Embarcação *</span>
              </label>
              <span className="text-[10px] text-indigo-700 dark:text-indigo-300 font-mono bg-indigo-50 dark:bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/40">
                Catálogo Oficial de Navios
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                required
                value={formData.nome_navio || ''}
                onChange={(e) => setFormData({ ...formData, nome_navio: e.target.value })}
                onBlur={() => {
                  if (!formData.imo && formData.nome_navio && formData.nome_navio.trim().length >= 3) {
                    handleCatalogoLookup(formData.nome_navio);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCatalogoLookup();
                  }
                }}
                placeholder="Ex: CYMONA LIFE, DAREEN, SAGA PIONEER..."
                className="flex-1 bg-white dark:bg-cco-panel border border-slate-300 dark:border-cco-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => handleCatalogoLookup()}
                disabled={isSearchingCatalogo || !formData.nome_navio?.trim()}
                className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-lg shadow-md shadow-indigo-600/30 flex items-center space-x-1.5 transition-all disabled:opacity-50 shrink-0 cursor-pointer text-xs"
                title="Consultar IMO oficial no catálogo interno de navios"
              >
                <Search className={`w-3.5 h-3.5 ${isSearchingCatalogo ? 'animate-spin' : ''}`} />
                <span>{isSearchingCatalogo ? 'Buscando...' : 'Buscar IMO (Catálogo)'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Digite o nome do navio e clique para preencher o <strong>IMO</strong> automaticamente pelo catálogo oficial.
            </p>
          </div>

          {/* Destaque 2: Campo IMO com Botão DataDocked Telemetria */}
          <div className="bg-slate-50 dark:bg-cco-darkest p-4 rounded-xl border border-cyan-200 dark:border-cyan-500/40 shadow-sm dark:shadow-inner space-y-2 transition-colors">
            <div className="flex items-center justify-between">
              <label className="text-slate-800 dark:text-slate-300 font-bold flex items-center space-x-2 text-xs">
                <span>Número IMO do Navio *</span>
                {formData.imo && (
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-normal flex items-center space-x-1 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-500/30">
                    <Check className="w-3 h-3" />
                    <span>IMO Identificado</span>
                  </span>
                )}
              </label>
              <span className="text-[10px] text-blue-600 dark:text-cyan-400 font-normal">Integração AIS DataDocked</span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={formData.imo || ''}
                onChange={(e) => setFormData({ ...formData, imo: e.target.value })}
                placeholder="Preenchido via Catálogo ou digite: 9234561..."
                className="flex-1 bg-white dark:bg-cco-panel border border-slate-300 dark:border-cco-border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleDataDockedLookup}
                disabled={isSearchingDataDocked || !formData.imo?.trim()}
                className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold rounded-lg shadow-md shadow-blue-600/30 flex items-center space-x-1.5 transition-all disabled:opacity-50 shrink-0 cursor-pointer text-xs"
                title="Sincronizar telemetria e posição no DataDocked"
              >
                <Sparkles className={`w-3.5 h-3.5 text-cyan-200 ${isSearchingDataDocked ? 'animate-spin' : ''}`} />
                <span>{isSearchingDataDocked ? 'Sincronizando...' : 'DataDocked AIS'}</span>
              </button>
            </div>
          </div>

          {/* Dados Principais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Tipo de Navio</label>
              <input
                type="text"
                value={formData.tipo_navio || ''}
                onChange={(e) => setFormData({ ...formData, tipo_navio: e.target.value })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Mercadoria Prevista *</label>
              <select
                value={formData.mercadoria || 'Barrilha'}
                onChange={(e) => setFormData({ ...formData, mercadoria: e.target.value })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="Barrilha">Barrilha</option>
                <option value="Trigo a Granel">Trigo a Granel</option>
                <option value="Malte a Granel">Malte a Granel</option>
                <option value="Carga Geral">Carga Geral</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Volume da Carga (toneladas) *</label>
              <input
                type="number"
                step="1"
                required
                value={formData.volume_t || ''}
                onChange={(e) => setFormData({ ...formData, volume_t: Number(e.target.value) })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Comprimento Total - LOA (metros)</label>
              <input
                type="number"
                step="0.1"
                value={formData.loa || ''}
                onChange={(e) => setFormData({ ...formData, loa: Number(e.target.value) })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Porte Bruto - DWT (toneladas)</label>
              <input
                type="number"
                step="1"
                value={formData.dwt || ''}
                onChange={(e) => setFormData({ ...formData, dwt: Number(e.target.value) })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Calado Operacional (m)</label>
              <input
                type="number"
                step="0.1"
                value={formData.calado || ''}
                onChange={(e) => setFormData({ ...formData, calado: Number(e.target.value) })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Agência Marítima</label>
              <input
                type="text"
                value={formData.agencia || ''}
                onChange={(e) => setFormData({ ...formData, agencia: e.target.value })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Marcos Temporais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-slate-200 dark:border-cco-border pt-3">
            <div>
              {(() => {
                const divergenciaModal = verificarDivergenciaEta(formData.eta_previsto, formData.eta_ais);
                return (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold text-xs">
                        Previsão Oficial (SISPORT / Porto)
                      </label>
                      {divergenciaModal?.temDivergencia && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border ${divergenciaModal.corBadge}`}>
                          ⚠️ {divergenciaModal.textoResumo}
                        </span>
                      )}
                    </div>
                    <input
                      type="datetime-local"
                      value={formData.eta_previsto || ''}
                      onChange={(e) => setFormData({ ...formData, eta_previsto: e.target.value })}
                      className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                    />
                    {formData.eta_ais && (
                      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center justify-between">
                        <span>Previsão AIS (DataDocked): <strong className="text-amber-600 dark:text-amber-300">{formatarDataBr(formData.eta_ais)}</strong></span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Chegada ao Fundeio (Real)</label>
              <input
                type="datetime-local"
                value={formData.chegada_fundeio || ''}
                onChange={(e) => setFormData({ ...formData, chegada_fundeio: e.target.value })}
                className="w-full bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Status Operacional Automático */}
          <div className="border-t border-slate-200 dark:border-cco-border pt-3">
            <div className="p-3 bg-slate-50 dark:bg-cco-darkest rounded-xl border border-slate-200 dark:border-cco-border flex items-center justify-between">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-semibold text-[11px]">Status Operacional</label>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    formData.status_cor === 'VERDE' ? 'bg-emerald-500 animate-pulse' :
                    formData.status_cor === 'VERMELHO' ? 'bg-rose-500' :
                    formData.status_cor === 'CINZA' ? 'bg-slate-400' : 'bg-amber-500'
                  }`}></span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase">
                    {formData.status_cor === 'VERDE' ? '🟢 Operando no Berço Comercial' :
                     formData.status_cor === 'VERMELHO' ? '🔴 No Fundeio Real (Ancorado na Barra AIS)' :
                     formData.status_cor === 'CINZA' ? '🔘 Liberado Autoridades (PSP)' :
                     '🟠 Fundeio Previsto (Aguardando Chegada ETA)'}
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono hidden sm:inline">Definido via telemetria AIS, ETA e berço</span>
            </div>

            {formData.status_cor === 'VERDE' && (
              <div className="mt-3 p-3 bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-500/30 rounded-xl flex items-center justify-between">
                <div>
                  <label className="block text-emerald-800 dark:text-emerald-300 font-semibold text-xs">
                    Progresso da Operação no Berço (% SISPORT)
                  </label>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Percentual de carga movimentada</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={formData.progresso_operacao ?? ''}
                    onChange={(e) => setFormData({ ...formData, progresso_operacao: e.target.value === '' ? null : Number(e.target.value) })}
                    className="w-24 bg-white dark:bg-cco-darkest border border-slate-300 dark:border-cco-border rounded-lg px-2.5 py-1 text-slate-900 dark:text-slate-200 font-mono text-xs text-right focus:outline-none focus:border-emerald-500"
                    placeholder="Ex: 21.1"
                  />
                  <span className="text-slate-500 dark:text-slate-400 font-mono text-xs font-bold">%</span>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Rodapé com Ações */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-cco-bg border-t border-slate-200 dark:border-cco-border flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-transparent font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white font-bold rounded-lg shadow-md shadow-blue-600/30 dark:shadow-cyan-600/30 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? 'Salvando...' : navioParaEditar ? 'Salvar Alterações' : 'Adicionar ao Line-up'}
          </button>
        </div>
      </div>
    </div>
  );
};
