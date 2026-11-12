import { useMemo } from "react";
import { ActivityLog } from "../../types";
import { 
  Package, 
  ArrowUpDown, 
  AlertTriangle, 
  UserCheck, 
  User, 
  Sliders, 
  Activity, 
  Clock, 
  ChevronRight 
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

interface ActivityFeedProps {
  activities: ActivityLog[];
}

function getActivityMeta(action: string, entity?: string) {
  const act = (action || '').toLowerCase();
  const ent = (entity || '').toLowerCase();

  if (act.includes('job') || act.includes('order') || ent.includes('transport_job') || ent.includes('job')) {
    return {
      label: 'Đơn Hàng',
      icon: Package,
      badgeColor: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400',
      lineColor: 'bg-emerald-500'
    };
  }
  if (act.includes('alert') || act.includes('stop') || act.includes('warning') || act.includes('lock')) {
    return {
      label: 'Cảnh Báo',
      icon: AlertTriangle,
      badgeColor: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      iconBg: 'bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400',
      lineColor: 'bg-rose-500'
    };
  }
  if (act.includes('assignment') || act.includes('shift') || ent.includes('assignment')) {
    return {
      label: 'Phân Công',
      icon: UserCheck,
      badgeColor: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
      iconBg: 'bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-400',
      lineColor: 'bg-purple-500'
    };
  }
  if (act.includes('user') || act.includes('account') || ent.includes('user')) {
    return {
      label: 'Nhân Sự',
      icon: User,
      badgeColor: 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/60 text-cyan-600 dark:text-cyan-400',
      lineColor: 'bg-cyan-500'
    };
  }
  if (act.includes('setting') || act.includes('config') || ent.includes('setting')) {
    return {
      label: 'Cài Đặt',
      icon: Sliders,
      badgeColor: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      iconBg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400',
      lineColor: 'bg-amber-500'
    };
  }
  if (act.includes('lift') || ent.includes('lift')) {
    return {
      label: 'Thang Tời',
      icon: ArrowUpDown,
      badgeColor: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      iconBg: 'bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400',
      lineColor: 'bg-blue-500'
    };
  }
  return {
    label: 'Hệ Thống',
    icon: Activity,
    badgeColor: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
    lineColor: 'bg-slate-400'
  };
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  // Sắp xếp hoạt động theo thứ tự mới nhất lên trên đầu (mới nhất -> cũ hơn)
  const displayedActivities = useMemo(() => {
    return [...activities]
      .sort((a, b) => {
        // Ưu tiên 1: timestamp dạng epoch millisecond
        const tA = a.timestamp || (a.created_at ? new Date(a.created_at).getTime() : 0);
        const tB = b.timestamp || (b.created_at ? new Date(b.created_at).getTime() : 0);
        if (!isNaN(tA) && !isNaN(tB) && tA !== tB) {
          return tB - tA;
        }
        // Ưu tiên 2: so sánh số ID nếu có dạng 'act-123456789' hoặc ID số
        const numA = parseInt(String(a.id).replace(/\D/g, ''), 10) || 0;
        const numB = parseInt(String(b.id).replace(/\D/g, ''), 10) || 0;
        return numB - numA;
      })
      .slice(0, 25);
  }, [activities]);

  const resolveDescription = (activity: ActivityLog) => {
    const desc = activity.description ? String(activity.description).trim() : '';
    if (desc) return desc;

    // Fallback thông minh nếu trường description bị trống hoặc null
    const act = (activity.action || '').toUpperCase();
    const entId = activity.entity_id ? (activity.entity_id.startsWith('#') ? activity.entity_id : `#${activity.entity_id}`) : '';
    
    if (act.includes('CREATE_JOB') || act === 'JOB') return `Tạo đơn vận chuyển ${entId || 'hàng hóa'}`;
    if (act.includes('COMPLETE')) return `Hoàn thành đơn vận chuyển ${entId}`;
    if (act.includes('CANCEL')) return `Đã hủy đơn vận chuyển ${entId}`;
    if (act.includes('UPDATE_JOB')) return `Cập nhật đơn vận chuyển ${entId}`;
    if (act.includes('ASSIGN') || act === 'ASSIGNMENT') return `Phân công ca trực ${entId ? `phụ trách ${entId}` : ''}`;
    if (act.includes('RESTRICT')) return `Cài đặt giới hạn tầng thang ${entId}`;
    if (act.includes('RESET')) return `Mở khóa giới hạn tầng thang ${entId}`;
    if (act.includes('STOP') || act.includes('EMERGENCY')) return `Kích hoạt DỪNG KHẨN CẤP thang ${entId}`;
    if (act.includes('RESUME')) return `Khôi phục vận hành thang ${entId}`;
    if (act.includes('LOCK')) return `Khóa vận hành thang ${entId}`;
    if (act.includes('UNLOCK')) return `Mở khóa thang ${entId}`;
    if (act.includes('MOVE') || act.includes('CALL')) return `Điều khiển di chuyển thang ${entId}`;
    if (act.includes('SETTING') || act === 'SETTING') return `Cập nhật cấu hình hệ thống`;
    if (act.includes('USER')) return `Thao tác tài khoản nhân sự ${entId}`;
    
    return `Thao tác vận hành hệ thống ${entId}`;
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm h-full max-h-[350px] sm:max-h-[400px] lg:max-h-none flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-3.5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/70 dark:bg-slate-900/70 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Hoạt Động Gần Đây
          </h3>
          <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {displayedActivities.length}
          </span>
        </div>
        <Link
          to="/history"
          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-0.5 hover:underline"
        >
          <span>Xem tất cả</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Activity List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 touch-pan-y divide-y divide-slate-100 dark:divide-slate-800/60">
        {displayedActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
            <Activity className="w-8 h-8 opacity-40" />
            <p className="text-xs font-medium">Chưa có hoạt động nào được ghi nhận</p>
          </div>
        ) : (
          displayedActivities.map((activity, idx) => {
            const meta = getActivityMeta(activity.action, activity.entity);
            const Icon = meta.icon;
            const description = resolveDescription(activity);
            const rawUser = activity.user_id ? String(activity.user_id).trim() : '';
            const userName = rawUser && rawUser.toLowerCase() !== 'system' ? rawUser : 'Hệ Thống';

            return (
              <div
                key={activity.id || idx}
                className="pt-2.5 first:pt-0 flex items-start gap-3 group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 p-1.5 rounded-xl transition-colors"
              >
                {/* Action Icon Pill */}
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 shadow-xs", meta.iconBg)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Operation Action Description - Clear, Prominent, Highly Legible */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                      {description}
                    </p>
                  </div>

                  {/* Metadata Subline: Time, Actor, Category Tag, Entity ID */}
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {/* Timestamp */}
                    <span className="flex items-center gap-1 font-mono text-[10px] text-slate-400 dark:text-slate-500">
                      <Clock className="w-3 h-3 shrink-0" />
                      {activity.created_at || 'Vừa xong'}
                    </span>

                    <span className="text-slate-300 dark:text-slate-700">•</span>

                    {/* Actor / Employee */}
                    <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                      {userName}
                    </span>

                    {/* Category Badge */}
                    <span className={cn("px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider border", meta.badgeColor)}>
                      {meta.label}
                    </span>

                    {/* Entity ID tag if not already mentioned in description */}
                    {activity.entity_id && !description.includes(activity.entity_id) && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        #{activity.entity_id}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
