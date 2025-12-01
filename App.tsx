import React from 'react';
import { Dashboard } from './components/Dashboard';

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-sm">
               DO
             </div>
             <div>
               <h1 className="text-xl font-bold text-slate-900">Diário Oficial Watcher</h1>
               <p className="text-xs text-slate-500">São João del-Rei / MG</p>
             </div>
          </div>
          <div className="text-xs text-slate-400 hidden sm:block">
            Powered by Google Gemini
          </div>
        </div>
      </header>
      
      <main className="py-8">
        <Dashboard />
      </main>
    </div>
  );
}

export default App;