import React from 'react';

interface PremiumStatProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon: string;
  trend?: {
    value: number;
    isUp: boolean;
  };
  delay?: number;
}

export const PremiumStat: React.FC<PremiumStatProps> = ({ 
  label, 
  value, 
  suffix = '', 
  icon, 
  trend,
  delay = 0
}) => {
  return (
    <div 
      className="premium-card p-6 animate-premium-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
          <span className="material-symbols-outlined text-premium gradient-text-indigo text-2xl">
            {icon}
          </span>
        </div>
        
        {trend && (
          <div className={`flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-lg ${
            trend.isUp ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'
          }`}>
            <span className="material-symbols-outlined text-sm">
              {trend.isUp ? 'trending_up' : 'trending_down'}
            </span>
            {trend.value}%
          </div>
        )}
      </div>

      <div>
        <p className="text-slate-400 font-medium mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="premium-stat-value">{value}</span>
          {suffix && <span className="text-slate-500 font-bold text-lg">{suffix}</span>}
        </div>
      </div>

      {/* Decorative background element */}
      <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-indigo-500/5 blur-3xl rounded-full" />
    </div>
  );
};
