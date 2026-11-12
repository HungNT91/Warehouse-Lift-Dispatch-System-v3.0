import { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}

export function StatCard({ 
  label, 
  value, 
  icon, 
  trend, 
  trendDirection = 'neutral',
  color = 'primary'
}: StatCardProps) {
  const colorStyles = {
    primary: "text-blue-500",
    success: "text-green-500",
    warning: "text-orange-500",
    danger: "text-red-500",
    info: "text-sky-500",
  };

  const trendStyles = {
    up: "text-green-500",
    down: "text-red-500",
    neutral: "text-slate-400",
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-3 md:p-4 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
      <div className="flex justify-between items-start mb-1">
        <p className={cn("text-[9px] md:text-[10px] uppercase tracking-wider font-bold", colorStyles[color] || "text-slate-500")}>
          {label}
        </p>
      </div>
      <div className="flex items-end gap-1 md:gap-2 mt-1 md:mt-0">
        <span className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</span>
        {trend && (
          <span className={cn("text-[9px] md:text-[10px] font-bold mb-0.5", trendStyles[trendDirection])}>
            {trendDirection === 'up' ? '↑' : trendDirection === 'down' ? '↓' : ''} {trend}
          </span>
        )}
      </div>
    </div>
  );
}
