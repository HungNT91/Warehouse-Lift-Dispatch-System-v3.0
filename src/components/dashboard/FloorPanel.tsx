import { Floor } from "../../types";
import { Users, Clock, ArrowRight } from "lucide-react";
import { cn } from "../../lib/utils";

interface FloorPanelProps {
  floors: Floor[];
}

export function FloorPanel({ floors }: FloorPanelProps) {
  // Sort descending by level (e.g. F4 at top, F1 at bottom)
  const sortedFloors = [...floors].sort((a, b) => b.level - a.level);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Trạng Thái Tầng</h3>
        <span className="text-[10px] bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wide">Trực Tiếp</span>
      </div>
      <div className="p-4 flex-1 flex flex-col gap-3 overflow-y-auto scrollbar-hide">
        {sortedFloors.map((floor) => (
          <div key={floor.level} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                floor.waiting_jobs > 0 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-800 dark:bg-slate-700 text-white"
              )}>
                T{floor.level}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">Tầng {floor.level}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {floor.current_lift ? `Tời ở tầng: ${floor.current_lift}` : `Nhân Viên: ${floor.assigned_employee}`}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className={cn(
                "text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                floor.waiting_jobs > 0 ? "bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              )}>
                {floor.waiting_jobs} Đơn
              </span>
              {floor.waiting_duration && (
                <span className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {floor.waiting_duration}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
