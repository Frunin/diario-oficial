import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RefreshCw, 
  FileText, 
  Clock, 
  CheckCircle, 
  Loader2,
  Calendar,
  ExternalLink,
  Sparkles,
  Archive,
  Terminal,
  Search,
  Globe
} from 'lucide-react';
import { checkForNewGazette } from '../services/scraperService';
import { GazetteDocument, ScrapeStatus, ScrapeLog, AppSettings } from '../types';
import ReactMarkdown from 'react-markdown';

export const Dashboard: React.FC = () => {
  const [status, setStatus] = useState<ScrapeStatus>(ScrapeStatus.IDLE);
  const [documents, setDocuments] = useState<GazetteDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<GazetteDocument | null>(null);
  const [logs, setLogs] = useState<ScrapeLog[]>([]);
  const [showDevMode, setShowDevMode] = useState(false);
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  const [settings, setSettings] = useState<AppSettings>(() => {
    const defaults: AppSettings = {
      morningCheck: "08:00",
      nightCheck: "20:00",
      lastCheckedUrl: null
    };

    try {
      const saved = localStorage.getItem('gazette_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...defaults, ...parsed };
      }
    } catch (e) {
      console.warn("Failed to parse settings from local storage, using defaults.");
    }
    
    return defaults;
  });

  useEffect(() => {
    localStorage.setItem('gazette_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (showDevMode && consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showDevMode]);

  const addLog = (status: 'SUCCESS' | 'FAILURE' | 'NO_CHANGE' | 'INFO', message: string, title?: string) => {
    const newLog: ScrapeLog = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      status: status,
      message,
      documentTitle: title
    };
    setLogs(prev => [newLog, ...prev].slice(0, 100));
  };

  const performCheck = useCallback(async () => {
    if (status !== ScrapeStatus.IDLE && status !== ScrapeStatus.COMPLETED && status !== ScrapeStatus.ERROR) return;

    setStatus(ScrapeStatus.CHECKING);
    addLog('INFO', 'Iniciando busca inteligente (Google Search)...');
    
    try {
      const results = await checkForNewGazette((msg) => addLog('INFO', msg));

      if (results.length === 0) {
        setStatus(ScrapeStatus.IDLE);
        addLog('NO_CHANGE', 'Nenhuma informação nova encontrada.');
        return;
      }

      setDocuments(results);
      
      const latestDoc = results[0];
      const isNew = latestDoc.url !== settings.lastCheckedUrl;

      if (isNew) {
        addLog('SUCCESS', 'NOVA INFORMAÇÃO ENCONTRADA!', latestDoc.title);
        setSettings(prev => ({ ...prev, lastCheckedUrl: latestDoc.url }));
      }
      
      if (!selectedDoc) {
          setSelectedDoc(results[0]);
      }
      
      setStatus(ScrapeStatus.IDLE);

    } catch (error) {
      console.error(error);
      setStatus(ScrapeStatus.ERROR);
      addLog('FAILURE', error instanceof Error ? error.message : "Erro desconhecido durante a busca");
    }
  }, [settings.lastCheckedUrl, status, selectedDoc]);

  // Automated Schedule Checker
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      
      if (timeString === settings.morningCheck || timeString === settings.nightCheck) {
        addLog('INFO', `Horário agendado (${timeString}) atingido. Executando rotina.`);
        performCheck();
      }
    }, 60000); 

    return () => clearInterval(timer);
  }, [settings.morningCheck, settings.nightCheck, performCheck]);


  return (
    <div className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
      
      {/* Top Bar with Dev Mode Toggle */}
      <div className="flex justify-end">
        <button 
          onClick={() => setShowDevMode(!showDevMode)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm
            ${showDevMode 
              ? 'bg-slate-900 text-green-400 border border-green-500/30 ring-2 ring-green-500/20' 
              : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
        >
          <Terminal className="w-4 h-4" />
          {showDevMode ? 'DEV MODE: ON' : 'DEV MODE'}
        </button>
      </div>

      {/* Dev Console Container */}
      {showDevMode && (
        <div className="bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
             <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500/50" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                <div className="w-3 h-3 rounded-full bg-green-500/50" />
             </div>
             <span className="text-[10px] font-mono text-slate-500">SEARCH_AGENT_LOGS_V2.0</span>
          </div>
          <div className="p-4 font-mono text-xs h-64 overflow-y-auto custom-scrollbar bg-slate-900/95 backdrop-blur">
            {logs.length === 0 ? (
               <div className="text-slate-600 italic"> Aguardando inicialização...</div>
            ) : (
                logs.slice().reverse().map((log) => (
                    <div key={log.id} className="mb-2 border-l-2 border-slate-800 pl-3 py-1 hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3 mb-1">
                            <span className="text-slate-500">
                                {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                            </span>
                            <span className={`font-bold px-1.5 rounded text-[10px] 
                                ${log.status === 'SUCCESS' ? 'bg-green-500/10 text-green-400' : 
                                log.status === 'FAILURE' ? 'bg-red-500/10 text-red-400' : 
                                log.status === 'INFO' ? 'bg-blue-500/10 text-blue-400' :
                                'bg-slate-700/50 text-slate-400'}`}>
                                {log.status}
                            </span>
                        </div>
                        <div className="text-slate-300 pl-[4.5rem] break-words leading-relaxed">
                            {log.message}
                        </div>
                    </div>
                ))
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Controls & Status (3 cols) */}
        <div className="lg:col-span-3 space-y-6">
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Globe className={`w-5 h-5 ${status === ScrapeStatus.CHECKING ? 'animate-spin' : ''}`} />
              Monitoramento
            </h2>
            
            <div className="space-y-4">
              <button
                onClick={performCheck}
                disabled={status === ScrapeStatus.CHECKING}
                className={`w-full py-3 px-4 rounded-lg font-medium text-white transition-all
                  ${status !== ScrapeStatus.CHECKING
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg' 
                    : 'bg-slate-400 cursor-not-allowed'}`}
              >
                {status === ScrapeStatus.CHECKING ? 'Pesquisando...' : 'Buscar Atualizações'}
              </button>

              {status === ScrapeStatus.CHECKING && (
                <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    <span className="font-medium">Consultando Google Search...</span>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Agendamento
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Manhã</label>
                <input 
                  type="time" 
                  value={settings.morningCheck}
                  onChange={(e) => setSettings(s => ({...s, morningCheck: e.target.value}))}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white text-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Noite</label>
                <input 
                  type="time" 
                  value={settings.nightCheck}
                  onChange={(e) => setSettings(s => ({...s, nightCheck: e.target.value}))}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white text-slate-900 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Middle Column: Document List (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-1 flex flex-col">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Search className="w-5 h-5 text-indigo-600" />
                Resultados
              </h2>
              
              {documents.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center text-sm">
                      <p>Nenhuma informação encontrada.</p>
                      <p className="text-xs mt-2">Clique em "Buscar" para iniciar.</p>
                  </div>
              ) : (
                  <div className="space-y-2 overflow-y-auto max-h-[600px] pr-2">
                      {documents.map((doc, idx) => (
                          <div 
                              key={`${doc.url}-${idx}`}
                              onClick={() => setSelectedDoc(doc)}
                              className={`p-3 rounded-lg border cursor-pointer transition-all relative
                                  ${selectedDoc?.url === doc.url 
                                      ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200' 
                                      : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'}`}
                          >
                              <div className="flex justify-between items-start gap-2">
                                  <span className="text-sm font-medium text-slate-700 leading-snug line-clamp-2">
                                      {doc.title}
                                  </span>
                              </div>
                              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <Globe className="w-3 h-3" />
                                    Web
                                  </span>
                                  {doc.url === settings.lastCheckedUrl && (
                                      <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                          NOVO
                                      </span>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              )}
            </div>
        </div>

        {/* Right Column: Content Viewer (6 cols) */}
        <div className="lg:col-span-6 h-full min-h-[500px]">
          {selectedDoc ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full sticky top-6">
              <div className="bg-slate-50 border-b border-slate-200 p-6">
                <div className="flex justify-between items-start gap-4">
                  <div>
                      <h1 className="text-xl font-bold text-slate-900 leading-tight">
                      {selectedDoc.title}
                      </h1>
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Identificado em: {selectedDoc.dateFound ? new Date(selectedDoc.dateFound).toLocaleDateString() : '-'}
                      </p>
                  </div>
                  <a 
                      href={selectedDoc.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors shadow-sm"
                  >
                      Acessar Fonte <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <div className="p-8 overflow-y-auto flex-1 bg-white">
                {selectedDoc.contentSummary ? (
                    <>
                      <div className="flex items-center gap-2 mb-4 text-amber-600 font-semibold text-sm uppercase tracking-wide">
                          <Sparkles className="w-4 h-4" /> Visão Geral (Gemini)
                      </div>
                      <div className="prose prose-slate prose-sm max-w-none text-slate-700">
                          <ReactMarkdown>{selectedDoc.contentSummary}</ReactMarkdown>
                      </div>
                    </>
                ) : (
                    <div className="text-center py-12 text-slate-500">
                        <p>Nenhum resumo disponível para este resultado.</p>
                    </div>
                )}
              </div>
              
              <div className="bg-slate-50 border-t border-slate-200 p-3 text-[10px] text-slate-400 text-center">
                Gemini 2.5 Flash + Google Search Grounding
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col items-center justify-center p-12 text-center text-slate-400">
              <FileText className="w-16 h-16 mb-4 text-slate-200" />
              <h3 className="text-lg font-semibold text-slate-600 mb-2">Nenhum item selecionado</h3>
              <p className="max-w-xs mx-auto text-sm">
                Selecione um resultado da busca para ver os detalhes encontrados pela IA.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
