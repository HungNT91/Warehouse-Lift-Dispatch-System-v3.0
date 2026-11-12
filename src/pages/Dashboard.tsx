import { useState, useMemo } from "react";
import { KpiAccordion } from "../components/dashboard/KpiAccordion";
import { LiftCard } from "../components/dashboard/LiftCard";
import { FloorPanel } from "../components/dashboard/FloorPanel";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { UncollectedAlertBanner } from "../components/dashboard/UncollectedAlertBanner";
import { useLiftStore } from "../stores/useLiftStore";
import { useAuthStore } from "../stores/useAuthStore";
import { Filter } from "lucide-react";
import { Floor } from "../types";

export function Dashboard() {
  const { lifts, activities, jobs } = useLiftStore();
  const { assignment } = useAuthStore();
  const [showAllLifts, setShowAllLifts] = useState(false);

  const displayedLifts = useMemo(() => {
    const list = (assignment && !showAllLifts)
      ? lifts.filter(lift => lift.id === assignment.lift_id)
      : lifts;
    return [...list].sort((a, b) =>
      a.lift_number.localeCompare(b.lift_number, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [assignment, showAllLifts, lifts]);
  // Compute dynamic floors state from real jobs and lifts
  const dynamicFloors: Floor[] = useMemo(() => {
    const floorEmployeeMap: Record<number, string> = {
      1: 'Nguyễn Văn An',
      2: 'Trần Thị Bình',
      3: 'Phạm Lan Trang',
      4: 'Đặng Anh Lực',
    };

    const levels = [4, 3, 2, 1];
    return levels.map(level => {
      // Waiting jobs originating at this floor or waiting pickup
      const waitingJobsAtFloor = jobs.filter(j =>
        (j.source_floor === level && j.status === 'CREATED') ||
        (j.target_floor === level && j.status === 'WAITING_PICKUP'))
        ;

      // Lifts currently at this floor
      const liftsAtFloor = lifts
        .filter(l => l.current_floor === level)
        .map(l => l.lift_number.replace('Lift ', 'Tời '));

      // Oldest waiting job duration calculation
      let durationStr: string | null = null;
      if (waitingJobsAtFloor.length > 0) {
        const oldestJob = waitingJobsAtFloor.reduce((oldest, j) => {
          return new Date(j.created_at).getTime() < new Date(oldest.created_at).getTime() ? j : oldest;
        }, waitingJobsAtFloor[0]);

        const diffMs = Date.now() - new Date(oldestJob.created_at).getTime();
        if (diffMs > 0) {
          const mins = Math.floor(diffMs / 60000);
          const secs = Math.floor((diffMs % 60000) / 1000);
          durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        }
      }

      return {
        level,
        waiting_jobs: waitingJobsAtFloor.length,
        assigned_employee: floorEmployeeMap[level] || 'Nhân viên kho',
        current_lift: liftsAtFloor.length > 0 ? liftsAtFloor.join(', ') : null,
        waiting_duration: durationStr
      };
    });
  }, [jobs, lifts]);

  return (
    <div className="flex flex-col gap-6 lg:gap-8 pb-12 lg:pb-0 flex-1 min-h-0 h-auto lg:h-full w-full max-w-full">
      {/* Global Uncollected Goods Alert Banner */}
      <UncollectedAlertBanner />

      {/* Accordion Collapsible Top KPI Section */}
      <KpiAccordion />

      {assignment && (
        <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800/60 p-2 px-4 rounded-xl">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            Chế độ xem: <span className="text-blue-600 dark:text-blue-400 font-extrabold">{showAllLifts ? 'TẤT CẢ TỜI HỆ THỐNG' : `TỜI PHÂN CÔNG (TỜI ${lifts.find(l => l.id === assignment.lift_id)?.lift_number.replace('Lift ', '') || ''} - TẦNG ${assignment.assigned_floor || 1})`}</span>
          </div>
          <button
            onClick={() => setShowAllLifts(!showAllLifts)}
            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-100 shadow-xs transition-colors cursor-pointer"
          >
            <Filter className="w-3.5 h-3.5" />
            {showAllLifts ? 'Chỉ hiện Tời của tôi' : 'Xem tất cả Tời'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 lg:min-h-0 pb-2 w-full">
        {/* Main Lift Monitoring Grid */}
        <div className={`lg:col-span-8 xl:col-span-9 grid gap-4 lg:pr-2 lg:pb-2 lg:min-h-0 w-full ${displayedLifts.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto lg:mx-0' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 lg:grid-rows-2 lg:overflow-hidden'}`}>
          {displayedLifts.map(lift => (
            <LiftCard key={lift.id} lift={lift} />
          ))}
        </div>

        {/* Right Sidebar Area (Floors & Feed) */}
        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-6 min-h-0 w-full">
          <div className="flex-none lg:max-h-[50%] lg:overflow-hidden h-auto max-h-[300px] lg:h-auto">
            <FloorPanel floors={dynamicFloors} />
          </div>
          <div className="flex-1 lg:overflow-hidden min-h-0 h-auto max-h-[350px] sm:max-h-[400px] lg:max-h-none lg:h-auto">
            <ActivityFeed activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
