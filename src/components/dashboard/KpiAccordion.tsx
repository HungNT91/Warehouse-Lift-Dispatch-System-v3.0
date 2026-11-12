import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, BarChart3, Activity, Clock, CheckCircle2, Cpu, Sparkles, AlertTriangle, Truck, Users } from 'lucide-react';
import { StatCard } from './StatCard';
import { useLiftStore } from '../../stores/useLiftStore';
import { safeParseTimestamp } from '../../utils/time';

export const KpiAccordion: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { lifts, jobs } = useLiftStore();

  const kpi = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- Tổng số thang ---
    const totalLifts = lifts.length;

    // --- Thang đang hoạt động (MOVING hoặc WAITING_PICKUP) ---
    const activeLifts = lifts.filter(l => l.status === 'MOVING' || l.status === 'WAITING_PICKUP').length;

    // --- Thang sẵn sàng ---
    const availableLifts = lifts.filter(l => l.status === 'AVAILABLE').length;

    // --- Thang bảo trì / offline ---
    const maintenanceLifts = lifts.filter(l => l.status === 'MAINTENANCE' || l.status === 'OFFLINE' || l.status === 'LOCKED').length;

    // --- Việc đang xử lý (CREATED, MOVING, WAITING_PICKUP, PICKED_UP) ---
    const activeJobs = jobs.filter(j =>
      j.status === 'CREATED' || j.status === 'MOVING' || j.status === 'WAITING_PICKUP' || j.status === 'PICKED_UP' || (j.status as string) === 'IN_PROGRESS'
    ).length;

    // --- Đã hoàn thành hôm nay ---
    const completedToday = jobs.filter(j => {
      if (j.status !== 'COMPLETED') return false;
      const updatedAt = new Date(j.updated_at || j.created_at);
      return updatedAt.getTime() >= today.getTime();
    }).length;

    // --- Tổng việc hôm nay ---
    const totalJobsToday = jobs.filter(j => {
      const createdAt = new Date(j.created_at);
      return createdAt.getTime() >= today.getTime();
    }).length;

    // --- Việc bị hủy / chậm trễ ---
    const cancelledJobs = jobs.filter(j => j.status === 'CANCELLED').length;

    // --- Thời gian chờ TB (từ các thang đang WAITING_PICKUP) ---
    const waitingLifts = lifts.filter(l => l.status === 'WAITING_PICKUP' && l.pickup_start_time);
    let avgWaitTime = '--:--';
    if (waitingLifts.length > 0) {
      const now = Date.now();
      const totalWaitMs = waitingLifts.reduce((sum, l) => {
        const start = l.pickup_start_time ? safeParseTimestamp(l.pickup_start_time) : now;
        const diff = Math.max(0, now - start);
        return sum + (diff < 2 * 3600 * 1000 ? diff : 0);
      }, 0);
      const avgMs = totalWaitMs / waitingLifts.length;
      const avgSecs = Math.floor(avgMs / 1000);
      const m = Math.floor(avgSecs / 60);
      const s = avgSecs % 60;
      avgWaitTime = `${m}:${s.toString().padStart(2, '0')}`;
    }

    // --- Hiệu suất (Completed / TotalToday) ---
    const efficiency = totalJobsToday > 0
      ? `${Math.round((completedToday / totalJobsToday) * 100)}%`
      : totalLifts > 0 && maintenanceLifts === 0
        ? '100%'
        : availableLifts > 0
          ? `${Math.round((availableLifts / totalLifts) * 100)}%`
          : '---';

    return {
      totalLifts,
      activeLifts,
      availableLifts,
      maintenanceLifts,
      activeJobs,
      completedToday,
      totalJobsToday,
      cancelledJobs,
      avgWaitTime,
      efficiency,
    };
  }, [lifts, jobs]);

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden shrink-0 transition-all">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer select-none"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="p-1.5 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>

          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Chỉ Số KPI
          </h3>

          {/* Summary when collapsed */}
          {!isOpen && (
            <div className="hidden sm:flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-3 my-0.5 animate-in fade-in duration-200">
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <strong className="text-slate-900 dark:text-slate-100">{kpi.totalLifts}</strong> Thang
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <Activity className="w-3.5 h-3.5" />
                <strong>{kpi.activeJobs}</strong> Đang xử lý
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <Clock className="w-3.5 h-3.5" />
                <strong>{kpi.avgWaitTime}</strong>
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <strong>{kpi.completedToday}</strong> xong
              </span>
            </div>
          )}
        </div>

        <div className="p-1.5 rounded-lg bg-white dark:bg-slate-700/80 border border-slate-200/80 dark:border-slate-600/80 text-slate-600 dark:text-slate-300 shadow-2xs hover:text-slate-900 dark:hover:text-white transition-colors">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Accordion Body */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100 border-t border-slate-100 dark:border-slate-800' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="p-3.5 md:p-4 bg-slate-50/30 dark:bg-slate-900/30">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">

              {/* 1. Tổng số thang */}
              <StatCard
                label="Tổng Số Thang"
                value={kpi.totalLifts.toString().padStart(2, '0')}
                icon={<Cpu className="w-4 h-4" />}
                trend="Thiết bị"
                trendDirection="neutral"
                color="primary"
              />

              {/* 2. Thang đang vận hành */}
              <StatCard
                label="Thang Đang Vận Hành"
                value={kpi.activeLifts.toString().padStart(2, '0')}
                icon={<Truck className="w-4 h-4" />}
                trend={kpi.activeLifts > 0 ? 'Đang hoạt động' : 'Rảnh'}
                trendDirection={kpi.activeLifts > 0 ? 'up' : 'neutral'}
                color="primary"
              />

              {/* 3. Việc đang xử lý */}
              <StatCard
                label="Việc Đang Xử Lý"
                value={kpi.activeJobs.toString().padStart(2, '0')}
                icon={<Activity className="w-4 h-4" />}
                trend={kpi.activeJobs > 0 ? 'Đang chạy' : 'Không có'}
                trendDirection={kpi.activeJobs > 0 ? 'up' : 'neutral'}
                color="primary"
              />

              {/* 4. Thời gian chờ TB */}
              <StatCard
                label="T.Gian Chờ TB"
                value={kpi.avgWaitTime}
                icon={<Clock className="w-4 h-4" />}
                trend="phút:giây"
                trendDirection="neutral"
                color="warning"
              />

              {/* 5. Xong hôm nay */}
              <StatCard
                label="Xong Hôm Nay"
                value={kpi.completedToday.toString().padStart(2, '0')}
                icon={<CheckCircle2 className="w-4 h-4" />}
                trend={kpi.totalJobsToday > 0 ? `/ ${kpi.totalJobsToday} đơn` : 'Đơn'}
                trendDirection={kpi.completedToday > 0 ? 'up' : 'neutral'}
                color="success"
              />

              {/* 6. Hiệu suất / Bảo trì — hidden on smaller grid, shown in xl */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 dark:from-blue-700 dark:to-indigo-900 p-3.5 rounded-2xl shadow-xs text-white flex-col justify-between hidden xl:flex">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider font-extrabold opacity-90">Hiệu Suất</p>
                  <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                </div>
                <div className="flex items-end justify-between mt-2">
                  <span className="text-2xl font-black">{kpi.efficiency}</span>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-bold uppercase">
                    {kpi.maintenanceLifts > 0 ? `${kpi.maintenanceLifts} Bảo Trì` : 'Tối ưu'}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
