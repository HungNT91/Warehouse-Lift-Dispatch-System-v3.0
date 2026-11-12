import { ActivityLog } from "../../types";
import { CheckCircle2, AlertCircle, Info, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";

interface ActivityFeedProps {
  activities: ActivityLog[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  // Giới hạn 25 nhật ký mới nhất để tránh kéo dài trang trên màn hình di động
  const displayedActivities = activities.slice(0, 25);

  const getLineColor = (type: string) => {
    switch (type) {
      case 'job': return "bg-green-500";
      case 'system': return "bg-blue-500";
      case 'alert': return "bg-red-500";
      default: return "bg-slate-300";
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm h-full max-h-[350px] sm:max-h-[400px] lg:max-h-none flex flex-col overflow-hidden">
      <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Hoạt Động Gần Đây</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {displayedActivities.length}
          </span>
        </div>
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-75"></div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3.5 sm:space-y-4 touch-pan-y">
        {displayedActivities.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">Chưa có hoạt động nào</p>
        ) : (
          displayedActivities.map((activity) => (
            <div key={activity.id} className="flex gap-3">
              <div className={cn("w-1 rounded-full h-auto shrink-0", getLineColor(activity.action))}></div>
              <div>
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-tight">{activity.description}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  {activity.created_at} • {activity.user_id && activity.user_id !== 'system' ? activity.user_id : 'Hệ Thống'}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
