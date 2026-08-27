import React, { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import ExceptionsPage from './pages/ExceptionsPage';
import ReportsPage from './pages/ReportsPage';

export default function App() {
  const [currentSession, setCurrentSession] = useState(null);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Navbar />
        
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Routes>
            <Route 
              path="/" 
              element={<DashboardPage currentSession={currentSession} />} 
            />
            <Route 
              path="/upload" 
              element={<UploadPage onReconciliationSuccess={setCurrentSession} />} 
            />
            <Route 
              path="/exceptions" 
              element={<ExceptionsPage />} 
            />
            <Route 
              path="/reports" 
              element={<ReportsPage />} 
            />
          </Routes>
        </main>

        <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
          <p>Finance Transaction Reconciliation & Operations Platform • Built for Finance Operations Internship</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}
