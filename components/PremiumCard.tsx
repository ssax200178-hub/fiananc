import React from 'react';

interface PremiumCardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: string;
  delay?: number;
}

export const PremiumCard: React.FC<PremiumCardProps> = ({ 
  children, 
  className = '', 
  title, 
  icon,
  delay = 0 
}) => {
  return (
    <div 
      className={`premium-card p-6 animate-premium-fade-up ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {(title || icon) && (
        <div className="flex items-center gap-3 mb-6">
          {icon && (
            <span className="material-symbols-outlined text-premium gradient-text-indigo">
              {icon}
            </span>
          )}
          {title && (
            <h3 className="text-lg font-bold text-slate-100">
              {title}
            </h3>
          )}
        </div>
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
