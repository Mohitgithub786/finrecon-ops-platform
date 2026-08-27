import React from 'react';

export default function KPICard({ title, value, subtext, icon: Icon, color = 'cyan', trend }) {
  const colorStyles = {
    cyan: {
      bg: 'from-cyan-500/10 to-blue-500/5',
      border: 'border-cyan-500/20',
      iconBg: 'bg-cyan-500/20 text-cyan-400',
    },
    emerald: {
      bg: 'from-emerald-500/10 to-teal-500/5',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/20 text-emerald-400',
    },
    amber: {
      bg: 'from-amber-500/10 to-orange-500/5',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/20 text-amber-400',
    },
    rose: {
      bg: 'from-rose-500/10 to-red-500/5',
      border: 'border-rose-500/20',
      iconBg: 'bg-rose-500/20 text-rose-400',
    },
    purple: {
      bg: 'from-purple-500/10 to-indigo-500/5',
      border: 'border-purple-500/20',
      iconBg: 'bg-purple-500/20 text-purple-400',
    }
  }[color];

  return (
    <div className={`p-5 rounded-2xl bg-gradient-to-br ${colorStyles.bg} border ${colorStyles.border} backdrop-blur-sm relative overflow-hidden transition-all hover:scale-[1.01]`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {title}
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-white font-mono tracking-tight">
            {value}
          </div>
          {subtext && (
            <p className="mt-1 text-xs text-slate-400 font-medium">
              {subtext}
            </p>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-xl ${colorStyles.iconBg}`}>
            <Icon className="w-6 h-6" />
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center gap-1.5 text-xs">
          <span className={trend.isPositive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            {trend.value}
          </span>
          <span className="text-slate-500">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
