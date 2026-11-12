import React, { useState, useEffect, useRef } from 'react';
import { useLiftStore } from '../../stores/useLiftStore';
import { safeParseTimestamp } from '../../utils/time';
import { useAuthStore } from '../../stores/useAuthStore';
import { speakUncollectedWarning } from '../../utils/audio';
import { AlertTriangle, PackageCheck, Clock, Lock, ArrowRight, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export const UncollectedAlertBanner: React.FC = () => {
  const { lifts, updateLift, updateJob, addJob } = useLiftStore();
  const { user, assignment } = useAuthStore();

  const waitingLifts = lifts.filter((l) => l.status === 'WAITING_PICKUP');

  const [timers, setTimers] = useState<{ [id: string]: number }>({});
  const lastWarnedIntervalRef = useRef<{ [liftId: string]: number }>({});

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newTimers: { [id: string]: number } = {};
      const activeLiftIds = new Set(waitingLifts.map(l => l.id));

      // Clean up ref for lifts that are no longer waiting pickup
      Object.keys(lastWarnedIntervalRef.current).forEach(liftId => {
        if (!activeLiftIds.has(liftId)) {
          delete lastWarnedIntervalRef.current[liftId];
        }
      });

      waitingLifts.forEach((lift) => {
        const rawStart = lift.pickup_start_time;
        let start = typeof rawStart === 'number' && rawStart > 0
          ? rawStart
          : (rawStart ? safeParseTimestamp(rawStart) : now);

        if (now - start < 0 || now - start > 2 * 3600 * 1000) {
          start = now;
        }

        const elapsedSecs = Math.max(0, Math.floor((now - start) / 1000));
        newTimers[lift.id] = elapsedSecs;

        // Auto trigger every 2-minute interval (>120s = 2m, >240s = 4m, >360s = 6m...) TTS Voice Announcement & Telegram Dispatch
        const intervalNumber = Math.floor(elapsedSecs / 120);
        if (intervalNumber >= 1) {
          const lastWarned = lastWarnedIntervalRef.current[lift.id] || 0;
          if (intervalNumber > lastWarned) {
            lastWarnedIntervalRef.current[lift.id] = intervalNumber;
            const minutes = intervalNumber * 2;

            // 1. Play Vietnamese Text-to-Speech Voice Warning ONLY for users assigned to this floor or Admins/Supervisors
            const userAssignedFloor = assignment?.assigned_floor;
            const isUserAdminOrSuper = user?.role === 'Admin' || user?.role === 'Supervisor';
            const shouldPlaySound = isUserAdminOrSuper || !userAssignedFloor || userAssignedFloor === lift.current_floor;

            if (shouldPlaySound) {
              speakUncollectedWarning(lift.lift_number, lift.current_floor, minutes);
            }
          }
        }
      });
      setTimers(newTimers);
    }, 1000);

    return () => clearInterval(interval);
  }, [waitingLifts, user, assignment]);

  if (waitingLifts.length === 0) return null;

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m > 0 ? `${m}m ` : ''}${s < 10 ? '0' : ''}${s}s`;
  };

  const handleQuickPickup = async (lift: any, returnToSource = false) => {
    if (lift.current_job_id) {
      updateJob(lift.current_job_id, { status: 'COMPLETED' });
    }

    if (returnToSource && lift.source_floor && lift.source_floor !== lift.current_floor) {
      const currentOperator = user?.full_name?.trim() || (user?.role === 'Admin' ? 'Admin' : user?.role === 'Supervisor' ? 'Giám sát kho' : 'Nhân viên kho');
      const returnJob = await addJob({
        lift_id: lift.id,
        created_by: user?.id || (user?.role === 'Admin' ? 'admin' : 'u1'),
        creator_name: currentOperator,
        source_floor: lift.current_floor,
        target_floor: lift.source_floor,
        status: 'MOVING',
        item_type: 'Trả tời trống',
        quantity: 1,
        notes: `Trả tời về Tầng ${lift.source_floor} sau khi lấy hàng ở Tầng ${lift.current_floor}`
      });

      const returnJobId = returnJob?.id || returnJob?.code;

      updateLift(lift.id, {
        status: 'MOVING',
        destination_floor: lift.source_floor,
        source_floor: lift.current_floor,
        pickup_start_time: null,
        progress: 0,
        current_job_id: returnJobId || null,
        operator: currentOperator
      });

      if (returnJobId) {
        updateJob(returnJobId, { status: 'MOVING' });
      }
      toast.success(`Đã xác nhận lấy hàng & tự động trả ${lift.lift_number.replace('Lift ', 'Tời ')} về Tầng ${lift.source_floor}`);
    } else {
      updateLift(lift.id, {
        status: 'AVAILABLE',
        current_job_id: null,
        pickup_start_time: null,
        source_floor: null,
        operator: null
      });
      toast.success(`Đã xác nhận lấy hàng thành công tại Tầng ${lift.current_floor}`);
    }
  };

  return (
    <div className="w-full bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white p-3.5 rounded-2xl shadow-lg shadow-orange-500/10 border border-amber-400/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-3 duration-300">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl shrink-0 mt-0.5">
          <ShieldAlert className="w-5 h-5 text-white animate-bounce" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm uppercase tracking-wide">
              CẢNH BÁO HÀNG TẠI THANG CHƯA LẤY ({waitingLifts.length} THANG)
            </span>
            <span className="px-2 py-0.5 bg-white/20 text-white rounded-full text-[10px] font-black uppercase">
              KHÓA GỌI THANG
            </span>
          </div>
          <p className="text-xs text-amber-50 font-medium mt-0.5 max-w-2xl">
            Tất cả các tầng khác bị tạm khóa gọi thang cho đến khi nhân viên tại tầng đích lấy hàng ra khỏi thang và bấm xác nhận.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
        {waitingLifts.map((lift) => {
          const duration = timers[lift.id] || 0;
          const isUserAtFloor = assignment?.assigned_floor === lift.current_floor;
          const isLongWaiting = duration > 60; // Over 1 min

          return (
            <div
              key={lift.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/10 backdrop-blur-md border border-white/20",
                isLongWaiting ? "bg-red-950/40 border-red-300 animate-pulse" : ""
              )}
            >
              <span className="font-black">{lift.lift_number.replace('Lift ', 'Tời ')}</span>
              <span className="text-amber-200">→ Tầng {lift.current_floor}</span>
              <span className="bg-black/30 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-300" />
                {formatDuration(duration)}
              </span>

              {isUserAtFloor && (
                <button
                  onClick={() => handleQuickPickup(lift, false)}
                  className="ml-1 px-2 py-1 bg-white text-orange-700 hover:bg-orange-50 font-extrabold rounded-lg text-[10px] uppercase shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <PackageCheck className="w-3 h-3" />
                  Lấy Hàng Tầng {lift.current_floor}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
