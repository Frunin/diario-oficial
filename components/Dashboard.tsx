import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  RefreshCw, 
  FileText, 
  CheckCircle, 
  Loader2,
  Calendar,
  ExternalLink,
  Sparkles,
  Archive,
  Terminal,
  Search,
  Globe,
  AlertTriangle
} from 'lucide-react';
import { checkForNewGazette } from '../services/scraperService';
import { GazetteDocument, ScrapeStatus, ScrapeLog, AppSettings } from '../services/types';
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

  const getLogColor = (status: string) => {
    switch (status) {
      case 'SUCCESS': return 'text-green-400';
      case 'FAILURE': return 'text-red-400';
      case 'NO_CHANGE': return 'text-slate-400';
      default: return 'text-blue-400';
    }
  };

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
                        <div className="flex items-center gap-2">
                             <span className="text-slate-500">[{log.timestamp.split('T')[1].split('.')[0]}]</span>
                             <span className={`font-bold ${getLogColor(log.status)}`}>{log.status}</span>
                             {log.documentTitle && <span className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-300">{log.documentTitle}</span>}
                        </div>
                        <div className="text-slate-300 pl-2 mt-0.5 whitespace-pre-wrap">{log.message}</div>
                    </div>
                ))
            )}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}

      {/* Main Status Card */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors duration-500
              ${status === ScrapeStatus.CHECKING ? 'bg-blue-50 text-blue-600' : 
                status === ScrapeStatus.ERROR ? 'bg-red-50 text-red-600' : 
                'bg-green-50 text-green-600'}`}>
               {status === ScrapeStatus.CHECKING ? <Loader2 className="w-7 h-7 animate-spin" /> : 
                status === ScrapeStatus.ERROR ? <AlertTriangle className="w-7 h-7" /> :
                <CheckCircle className="w-7 h-7" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                {status === ScrapeStatus.CHECKING ? 'Verificando atualizações...' : 
                 status === ScrapeStatus.ERROR ? 'Erro na verificação' : 
                 'Monitoramento Ativo'}
              </h2>
              <p className="text-slate-500 mt-1">
                 Próxima verificação automática às <span className="font-medium text-slate-700">{settings.morningCheck}</span> e <span className="font-medium text-slate-700">{settings.nightCheck}</span>
              </p>
            </div>
          </div>

          <button
            onClick={performCheck}
            disabled={status === ScrapeStatus.CHECKING}
            className="group flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-medium transition-all active:scale-95"
          >
            <RefreshCw className={`w-5 h-5 ${status === ScrapeStatus.CHECKING ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            {status === ScrapeStatus.CHECKING ? 'Verificando...' : 'Verificar Agora'}
          </button>
      </div>

      {/* Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: List */}
        <div className="lg:col-span-1 flex flex-col gap-4">
           <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider px-2">Documentos Recentes</h3>
           {documents.length === 0 ? (
             <div className="bg-white rounded-xl p-8 text-center border border-slate-100 border-dashed">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                  <Archive className="w-6 h-6" />
                </div>
                <p className="text-slate-500 text-sm">Nenhum documento carregado.</p>
             </div>
           ) : (
             <div className="flex flex-col gap-3">
               {documents.map((doc, idx) => (
                 <button 
                   key={idx}
                   onClick={() => setSelectedDoc(doc)}
                   className={`text-left p-4 rounded-xl border transition-all duration-200 relative overflow-hidden
                     ${selectedDoc === doc 
                       ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                       : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-md text-slate-600'}`}
                 >
                   {doc.isNew && (
                     <div className="absolute top-0 right-0 p-1.5">
                       <span className="flex h-3 w-3">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                       </span>
                     </div>
                   )}
                   <div className="flex items-start justify-between mb-2">
                     <span className={`text-xs font-bold px-2 py-1 rounded-md ${selectedDoc === doc ? 'bg-blue-500/50 text-blue-50' : 'bg-slate-100 text-slate-500'}`}>
                       {doc.publicationDate}
                     </span>
                     <ExternalLink className={`w-4 h-4 ${selectedDoc === doc ? 'text-blue-200' : 'text-slate-300'}`} />
                   </div>
                   <h4 className="font-semibold leading-tight mb-1">{doc.title}</h4>
                   <p className={`text-xs ${selectedDoc === doc ? 'text-blue-100' : 'text-slate-400'} line-clamp-2`}>
                     {doc.contentSummary ? doc.contentSummary.slice(0, 100).replace(/[#*]/g, '') : 'Clique para ver detalhes...'}
                   </p>
                 </button>
               ))}
             </div>
           )}
        </div>

        {/* Right Column: Details */}
        <div className="lg:col-span-2">
           <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider px-2 mb-4">Detalhes do Documento</h3>
           
           {!selectedDoc ? (
             <div className="bg-slate-50 rounded-2xl h-96 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-200">
                <Search className="w-12 h-12 mb-3 opacity-20" />
                <p>Selecione um documento para visualizar a análise.</p>
             </div>
           ) : (
             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Document Header */}
                <div className="bg-slate-50 p-6 border-b border-slate-100">
                   <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedDoc.title}</h2>
                        <div className="flex items-center gap-4 text-sm text-slate-500">
                           <div className="flex items-center gap-1.5">
                             <Calendar className="w-4 h-4" />
                             {selectedDoc.publicationDate}
                           </div>
                           <div className="flex items-center gap-1.5">
                             <Globe className="w-4 h-4" />
                             Diário Oficial
                           </div>
                        </div>
                      </div>
                      
                      <a 
                        href={selectedDoc.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
                      >
                        <FileText className="w-4 h-4" />
                        Ver PDF Original
                      </a>
                   </div>
                </div>

                {/* AI Summary Content */}
                <div className="p-8">
                   <div className="flex items-center gap-2 mb-6 text-blue-600">
                      <Sparkles className="w-5 h-5" />
                      <h3 className="font-bold uppercase tracking-wide text-sm">Resumo Inteligente</h3>
                   </div>
                   
                   <div className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-600 hover:prose-a:text-blue-700 prose-sm">
                      {selectedDoc.contentSummary ? (
                        <ReactMarkdown>{selectedDoc.contentSummary}</ReactMarkdown>
                      ) : (
                        <div className="flex items-center gap-3 text-slate-500 bg-slate-50 p-4 rounded-lg">
                           <Loader2 className="w-5 h-5 animate-spin" />
                           <p>Processando resumo...</p>
                        </div>
                      )}
                   </div>
                   
                   {/* Disclaimer */}
                   <div className="mt-8 pt-6 border-t border-slate-100">
                      <div className="flex gap-3 items-start p-4 rounded-lg bg-orange-50 text-orange-800 text-xs">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <p>
                          Este resumo foi gerado automaticamente por Inteligência Artificial e pode conter imprecisões. 
                          Sempre verifique o documento original (PDF) para informações oficiais e legais.
                        </p>
                      </div>
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};