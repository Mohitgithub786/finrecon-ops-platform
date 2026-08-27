import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, UploadCloud, AlertTriangle, FileSpreadsheet, ShieldCheck } from 'lucide-react';

export default function Navbar() {
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/upload', label: 'Upload & Reconcile', icon: UploadCloud },
    { to: '/exceptions', label: 'Exceptions Queue', icon: AlertTriangle },
    { to: '/reports', label: 'Reports & Export', icon: FileSpreadsheet },
  ];

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
                FinOps Recon
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-cyan-400 font-semibold">
                Transaction Integrity Platform
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 shadow-inner'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          {/* User Badge */}
          <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-400">
              FO
            </div>
            <div className="hidden lg:block text-xs">
              <span className="block font-semibold text-slate-200">Finance Ops Intern</span>
              <span className="block text-slate-500">Live Demo Instance</span>
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
