import React, { useState, useEffect } from "react";
import { Lift } from "../../types";
import { cn } from "../../lib/utils";
import { useAuthStore } from "../../stores/useAuthStore";
import { Lock, Unlock, X, ArrowUp, ArrowDown, AlertCircle, AlertTriangle, Clock, RotateCcw, PackageCheck, Eye, Play, AlertOctagon } from "lucide-react";
import { useLiftStore } from "../../stores/useLiftStore";
import { safeParseTimestamp, getEffectiveAllowedFloors, hasActiveFloorRestriction } from "../../utils/time";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { speakLiftArrival } from "../../utils/audio";
import { broadcastLiftArrival } from "../../utils/liftBroadcast";
import { LiftDetailsModal } from "./LiftDetailsModal";
import { LiftIssueReportModal } from "./LiftIssueReportModal";

interface LiftCardProps {
  lift: Lift;
}

const statusThemes = {
  'AVAILABLE': { border: 'border-slate-200 dark:border-slate-800 ring-slate-50 dark:ring-slate-900', bg: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400', mainBg: 'bg-slate-50 dark:bg-slate-900/50', text: 'text-slate-300 dark:text-slate-600', label: 'SẴN SÀNG' },
  'WAITING_PICKUP': { border: 'border-amber-500 dark:border-amber-600 ring-4 ring-amber-400/40 shadow-md shadow-amber-500/20', bg: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300', mainBg: 'bg-amber-50/60 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', label: 'CHỜ LẤY HÀNG' },
  'MOVING': { border: 'border-blue-200 dark:border-blue-800 ring-blue-50 dark:ring-blue-900/20', bg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400', mainBg: 'bg-slate-50 dark:bg-slate-900/50', text: 'text-blue-600 dark:text-blue-500', label: 'DI CHUYỂN' },
  'RESERVED': { border: 'border-blue-200 dark:border-blue-800 ring-blue-50 dark:ring-blue-900/20 ring-2', bg: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400', mainBg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-600 dark:text-blue-500', label: 'ĐÃ ĐẶT' },
  'LOCKED': { border: 'border-purple-200 dark:border-purple-800 ring-purple-50 dark:ring-purple-900/20 ring-2', bg: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400', mainBg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-500', label: 'ĐÃ KHÓA' },
  'OFFLINE': { border: 'border-slate-200 dark:border-slate-800 ring-slate-50 dark:ring-slate-900', bg: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400', mainBg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-400 dark:text-slate-500', label: 'NGOẠI TUYẾN' },
  'MAINTENANCE': { border: 'border-slate-200 dark:border-slate-800 ring-slate-50 dark:ring-slate-900', bg: 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300', mainBg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-400 dark:text-slate-500', label: 'BẢO TRÌ' },
  'STOPPED': { border: 'border-rose-500 dark:border-rose-600 ring-4 ring-rose-400/40 shadow-md shadow-rose-500/20', bg: 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300', mainBg: 'bg-rose-50/60 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400', label: 'ĐÃ DỪNG' },
};

export const LiftCard: React.FC<LiftCardProps> = ({ lift }) => {
  const { user, assignment } = useAuthStore();
  const { updateLift, addJob, updateJob, addActivity } = useLiftStore();
  const canLock = user?.role === 'Supervisor' || user?.role === 'Admin';
  const isWorker = user?.role === 'Worker';

  // Permission checks
  const isAssignedLift = !isWorker || !assignment || assignment.lift_id === lift.id;
  const isAssignedFloor = !isWorker || !assignment || !assignment.assigned_floor || lift.current_floor === assignment.assigned_floor;

  const [showFloorSelector, setShowFloorSelector] = useState(false);
  const [waitingSeconds, setWaitingSeconds] = useState(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

  // Live timer for WAITING_PICKUP
  useEffect(() => {
    let interval: any;
    if (lift.status === 'WAITING_PICKUP') {
      const rawStart = lift.pickup_start_time;
      let startTime = typeof rawStart === 'number' && rawStart > 0
        ? rawStart
        : (rawStart ? safeParseTimestamp(rawStart) : Date.now());

      if (Date.now() - startTime < 0 || Date.now() - startTime > 2 * 3600 * 1000) {
        startTime = Date.now();
      }

      const calcSecs = () => Math.max(0, Math.floor((Date.now() - startTime) / 1000));
      setWaitingSeconds(calcSecs());

      interval = setInterval(() => {
        setWaitingSeconds(calcSecs());
      }, 1000);
    } else {
      setWaitingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [lift.status, lift.pickup_start_time]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m > 0 ? `${m}m ` : ''}${s < 10 ? '0' : ''}${s}s`;
  };

  // Simulation for lift movement (20 seconds per floor)
  useEffect(() => {
    let timer: any;
    const effectiveDestFloor = lift.destination_floor || (lift.source_floor ? (lift.current_floor === lift.source_floor ? (lift.source_floor === 1 ? 2 : 1) : lift.current_floor) : null);

    if (lift.status === 'MOVING' && (lift.destination_floor || effectiveDestFloor)) {
      const destFloor = lift.destination_floor || effectiveDestFloor || lift.current_floor;
      const floorsToTravel = Math.abs(destFloor - lift.current_floor) || 1;
      const totalSeconds = floorsToTravel * 20; // 20 seconds per floor
      const increment = 100 / totalSeconds;

      const currentProg = (typeof lift.progress === 'number' && !isNaN(lift.progress)) ? lift.progress : 0;

      if (currentProg < 100) {
        timer = setTimeout(() => {
          updateLift(lift.id, { progress: Math.min(currentProg + increment, 100) });
        }, 1000);
      } else {
        // Arrived at destination
        // Check if current active job is an empty call or return job
        const { jobs } = useLiftStore.getState();
        const activeJob = lift.current_job_id
          ? jobs.find(j => j.id === lift.current_job_id || j.code === lift.current_job_id)
          : null;

        const isEmptyCall = activeJob
          ? (
            activeJob.item_type?.includes('Gọi tời') ||
            activeJob.item_type?.includes('Trả tời') ||
            activeJob.notes?.includes('Gọi tời') ||
            activeJob.notes?.includes('Trả tời') ||
            activeJob.item_type?.includes('tời trống')
          )
          : false;

        // Trạng thái cập bến: useLiftStore.updateLift sẽ tự động kích hoạt broadcastLiftArrival tập trung
        if (isEmptyCall) {
          // Empty call/return lift arriving at destination -> Immediately AVAILABLE
          updateLift(lift.id, {
            status: 'AVAILABLE',
            current_floor: destFloor,
            destination_floor: null,
            source_floor: null,
            pickup_start_time: null,
            current_job_id: null,
            operator: null,
            progress: 0
          });
          if (lift.current_job_id) {
            updateJob(lift.current_job_id, { status: 'COMPLETED' });
          }
          toast.success(`${lift.lift_number.replace('Lift ', 'Tời ')} đã đến Tầng ${destFloor} và sẵn sàng!`);
        } else {
          // Loaded cargo lift arriving at destination -> WAITING_PICKUP
          updateLift(lift.id, {
            status: 'WAITING_PICKUP',
            current_floor: destFloor,
            destination_floor: destFloor,
            pickup_start_time: Date.now(),
            progress: 100
          });
          if (lift.current_job_id) {
            updateJob(lift.current_job_id, { status: 'WAITING_PICKUP' });
          }
        }
      }
    }

    return () => clearTimeout(timer);
  }, [lift.status, lift.progress, lift.destination_floor, lift.current_floor, lift.id, lift.current_job_id, lift.source_floor, updateLift, updateJob]);

  const handleSendGoods = async (targetFloor: number) => {
    if (isWorker && !isAssignedFloor) {
      toast.error(`Bạn được phân công ở Tầng ${assignment?.assigned_floor}. Không thể gửi hàng từ Tầng ${lift.current_floor}!`);
      return;
    }
    const effectiveAllowed = getEffectiveAllowedFloors(lift);
    const isAllowedSource = effectiveAllowed.includes(lift.current_floor);
    const isAllowedTarget = effectiveAllowed.includes(targetFloor);
    if (!isAllowedSource || !isAllowedTarget) {
      toast.error(`🚫 Tầng gửi (T${lift.current_floor}) hoặc tầng đích (T${targetFloor}) đã bị Quản lý giới hạn hoạt động đối với tời này! (Tời chỉ phục vụ: ${effectiveAllowed.map(f => `T${f}`).join(', ')})`);
      return;
    }
    setShowFloorSelector(false);

    const currentOperator = user?.full_name?.trim() || (user?.role === 'Admin' ? 'Admin' : user?.role === 'Supervisor' ? 'Giám sát kho' : 'Nhân viên kho');

    // Save transport job to DB (transport_jobs)
    const createdJob = await addJob({
      lift_id: lift.id,
      created_by: user?.id || (user?.role === 'Admin' ? 'admin' : 'u1'),
      creator_name: currentOperator,
      source_floor: lift.current_floor,
      target_floor: targetFloor,
      status: 'MOVING',
      item_type: 'Pallet Hàng',
      quantity: 1,
      notes: `Gửi hàng từ Tầng ${lift.current_floor} đến Tầng ${targetFloor}`
    });

    const realJobId = createdJob?.id || createdJob?.code;

    updateLift(lift.id, {
      status: 'MOVING',
      source_floor: lift.current_floor,
      destination_floor: targetFloor,
      progress: 0,
      current_job_id: realJobId || null,
      operator: currentOperator
    });

    toast.success(`Đã gửi hàng từ Tầng ${lift.current_floor} đến Tầng ${targetFloor}`);
  };

  const handleConfirmPickup = async (returnToSource = false) => {
    if (!isAssignedLift) {
      toast.error("Bạn không thuộc phân công tời này!");
      return;
    }
    if (!isAssignedFloor) {
      toast.error(`Bạn được phân công tại Tầng ${assignment?.assigned_floor}. Không thể lấy hàng ở Tầng ${lift.current_floor}!`);
      return;
    }

    if (lift.current_job_id) {
      updateJob(lift.current_job_id, { status: 'COMPLETED' });
    }

    if (returnToSource && lift.source_floor && lift.source_floor !== lift.current_floor) {
      const target = lift.source_floor;

      // Log return transport job to DB
      const currentOperator = user?.full_name?.trim() || (user?.role === 'Admin' ? 'Admin' : user?.role === 'Supervisor' ? 'Giám sát kho' : 'Nhân viên kho');
      const returnJob = await addJob({
        lift_id: lift.id,
        created_by: user?.id || (user?.role === 'Admin' ? 'admin' : 'u1'),
        creator_name: currentOperator,
        source_floor: lift.current_floor,
        target_floor: target,
        status: 'MOVING',
        item_type: 'Trả tời trống',
        quantity: 1,
        notes: `Trả tời về Tầng ${target} sau khi lấy hàng ở Tầng ${lift.current_floor}`
      });

      const returnJobId = returnJob?.id || returnJob?.code;

      updateLift(lift.id, {
        status: 'MOVING',
        destination_floor: target,
        source_floor: lift.current_floor,
        pickup_start_time: null,
        progress: 0,
        current_job_id: returnJobId || null,
        operator: currentOperator
      });

      toast.success(`Đã xác nhận lấy hàng & tự động trả ${lift.lift_number.replace('Lift ', 'Tời ')} về Tầng ${target}`);
    } else {
      updateLift(lift.id, {
        status: 'AVAILABLE',
        current_job_id: null,
        pickup_start_time: null,
        source_floor: null,
        operator: null
      });
      toast.success(`Xác nhận đã lấy hàng thành công tại Tầng ${lift.current_floor}. Tời sẵn sàng!`);
    }
  };

  const handleCallLift = async () => {
    if (!assignment?.assigned_floor) return;
    const targetFloor = assignment.assigned_floor;

    const effectiveAllowed = getEffectiveAllowedFloors(lift);
    const isAllowedTarget = effectiveAllowed.includes(targetFloor);
    const isAllowedCurrent = effectiveAllowed.includes(lift.current_floor);
    if (!isAllowedTarget || !isAllowedCurrent) {
      toast.error(`🚫 Tầng của bạn (T${targetFloor}) hoặc tầng hiện tại của tời (T${lift.current_floor}) đã bị Quản lý giới hạn hoạt động đối với tời này! (Tời chỉ phục vụ: ${effectiveAllowed.map(f => `T${f}`).join(', ')})`);
      return;
    }
    if (lift.status === 'WAITING_PICKUP') {
      toast.error(`🚫 Không thể gọi tời! Tầng ${lift.current_floor} chưa lấy hàng ra khỏi tời. Cần Tầng ${lift.current_floor} bấm xác nhận đã lấy hàng trước!`);
      return;
    }

    if (lift.current_floor === assignment.assigned_floor) {
      toast.info(`Tời đã ở Tầng ${assignment.assigned_floor}`);
      return;
    }

    const currentOperator = user?.full_name?.trim() || (user?.role === 'Admin' ? 'Admin' : user?.role === 'Supervisor' ? 'Giám sát kho' : 'Nhân viên kho');
    const createdJob = await addJob({
      lift_id: lift.id,
      created_by: user?.id || (user?.role === 'Admin' ? 'admin' : 'u1'),
      creator_name: currentOperator,
      source_floor: lift.current_floor,
      target_floor: assignment.assigned_floor,
      status: 'MOVING',
      item_type: 'Gọi tời trống',
      quantity: 1,
      notes: `Gọi tời từ Tầng ${lift.current_floor} về Tầng ${assignment.assigned_floor}`
    });

    const realJobId = createdJob?.id || createdJob?.code;

    updateLift(lift.id, {
      status: 'MOVING',
      destination_floor: assignment.assigned_floor,
      source_floor: lift.current_floor,
      progress: 0,
      current_job_id: realJobId || null,
      operator: currentOperator
    });

    toast.success(`Đã gọi ${lift.lift_number.replace('Lift ', 'Tời ')} từ Tầng ${lift.current_floor} về Tầng ${assignment.assigned_floor}`);
  };

  const handleEmergencyStop = (targetLift: Lift = lift) => {
    const liftName = targetLift.lift_number ? targetLift.lift_number.replace('Lift ', 'Tời ') : 'Tời';
    updateLift(targetLift.id, {
      status: 'STOPPED'
    });
    addActivity({
      user_id: user?.id || 'u1',
      action: 'EMERGENCY_STOP',
      entity: 'lift',
      entity_id: liftName,
      description: `Kích hoạt DỪNG KHẨN CẤP ${liftName}`
    });
    toast.error(`🚨 ĐÃ DỪNG KHẨN CẤP ${liftName}!`);
  };

  const handleResumeLift = (targetLift: Lift = lift) => {
    const liftName = targetLift.lift_number ? targetLift.lift_number.replace('Lift ', 'Tời ') : 'Tời';
    if (targetLift.destination_floor) {
      updateLift(targetLift.id, {
        status: 'MOVING'
      });
      toast.success(`Đã cho phép ${liftName} TIẾP TỤC DI CHUYỂN đến Tầng ${targetLift.destination_floor}!`);
    } else {
      updateLift(targetLift.id, {
        status: 'AVAILABLE'
      });
      toast.success(`Đã khôi phục trạng thái SẴN SÀNG cho ${liftName}!`);
    }
    addActivity({
      user_id: user?.id || 'u1',
      action: 'RESUME_LIFT',
      entity: 'lift',
      entity_id: liftName,
      description: `Cho phép ${liftName} tiếp tục di chuyển / khôi phục hoạt động`
    });
  };

  const handleToggleLock = (targetLift: Lift = lift) => {
    if (!canLock) {
      toast.error('Chỉ Quản lý / Admin mới có quyền khóa hoặc mở khóa tời!');
      return;
    }
    const newStatus = targetLift.status === 'LOCKED' ? 'AVAILABLE' : 'LOCKED';
    updateLift(targetLift.id, { status: newStatus });
    toast.info(newStatus === 'LOCKED' ? `Đã khóa ${targetLift.lift_number.replace('Lift ', 'Tời ')}` : `Đã mở khóa ${targetLift.lift_number.replace('Lift ', 'Tời ')}`);
  };

  const isMoving = lift.status === 'MOVING';
  const isWaitingPickup = lift.status === 'WAITING_PICKUP';
  const isStoppedOrBlocked = lift.status === 'STOPPED' || lift.status === 'MAINTENANCE' || lift.status === 'OFFLINE';

  const displayFloor = isMoving && lift.destination_floor
    ? Math.round(lift.current_floor + (lift.destination_floor - lift.current_floor) * (lift.progress / 100))
    : lift.current_floor;

  const isGoingUp = Boolean(isMoving && lift.destination_floor && lift.destination_floor > lift.current_floor);

  const direction = isMoving && lift.destination_floor
    ? (isGoingUp ? 'Đang đi lên' : 'Đang đi xuống')
    : lift.status === 'AVAILABLE' ? 'Đang trống' : (lift.status === 'WAITING_PICKUP' ? 'Đã tải xong' : 'Đang dừng');

  const theme = statusThemes[lift.status] || statusThemes['AVAILABLE'];

  return (
    <div className={cn("rounded-2xl p-3 border flex flex-col shadow-sm bg-white dark:bg-slate-900 min-h-[240px] lg:h-full lg:min-h-0 relative transition-all", theme.border, isStoppedOrBlocked ? "border-rose-300 dark:border-rose-900/60" : "")}>

      {/* Top Warning Alert Banner for Uncollected Goods */}
      {isWaitingPickup && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-2 rounded-xl text-[11px] font-extrabold flex items-center justify-between shadow-xs mb-2 animate-pulse">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-100" />
            <span>⚠️ TẦNG {lift.current_floor} CHƯA LẤY HÀNG</span>
          </div>
          <span className="bg-black/30 px-2 py-0.5 rounded-md font-mono text-[10px] flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-200" />
            {formatDuration(waitingSeconds)}
          </span>
        </div>
      )}

      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{lift.lift_number.replace('Lift ', 'Tời ')}</h3>
            {isWorker && assignment?.lift_id === lift.id && (
              <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 px-1.5 py-0.2 rounded font-extrabold uppercase">CỦA BẠN</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={cn("px-2 py-0.5 text-[10px] font-bold rounded-full uppercase", theme.bg)}>
              {theme.label}
            </span>
            {hasActiveFloorRestriction(lift) && (
              <span
                className="px-2 py-0.5 text-[9px] font-black rounded-full uppercase bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1"
                title={`Chỉ hoạt động ở Tầng ${getEffectiveAllowedFloors(lift).join(', ')} (Thiết lập bởi: ${lift.restricted_by_name || 'Quản lý'})`}
              >
                <Lock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                {getEffectiveAllowedFloors(lift).map(f => `T${f}`).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="flex items-center gap-1.5 mb-1">
            <button
              onClick={() => setIsIssueModalOpen(true)}
              className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 dark:hover:bg-rose-900/80 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/80 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
              title="Báo sự cố thang tời tới Đội Bảo Trì Kỹ Thuật"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-tight text-rose-700 dark:text-rose-300">CẢNH BÁO</span>
            </button>
            <button
              onClick={() => setIsDetailsOpen(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
              title="Xem chi tiết & lịch sử tời"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            {canLock && (
              <button
                onClick={() => handleToggleLock(lift)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors cursor-pointer"
                title={lift.status === 'LOCKED' ? 'Mở Khóa Tời' : 'Khóa Tời'}
              >
                {lift.status === 'LOCKED' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              </button>
            )}
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1 ml-1">
              {isMoving && (
                <motion.span
                  animate={{ y: isGoingUp ? [-1, -3, -1] : [1, 3, 1] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="inline-flex"
                >
                  {isGoingUp ? (
                    <ArrowUp className="w-3.5 h-3.5 text-blue-500" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                  )}
                </motion.span>
              )}
              {isStoppedOrBlocked ? '--' : `Tầng ${displayFloor}${lift.destination_floor ? ` → Tầng ${lift.destination_floor}` : ''}`}
            </p>
          </div>
          {!isStoppedOrBlocked && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {lift.current_job_id ? `Việc #${lift.current_job_id}` : (lift.operator ? `NV: ${lift.operator}` : 'Rảnh')}
            </p>
          )}
        </div>
      </div>

      <div className={cn("flex-1 flex flex-col justify-center items-center py-2 rounded-xl mb-3 relative overflow-hidden min-h-0", theme.mainBg)}>
        {isMoving && (
          <div className="absolute left-0 bottom-0 h-1 bg-blue-500 transition-all duration-1000 ease-linear" style={{ width: `${lift.progress}%` }}></div>
        )}
        <div className="relative h-12 flex items-center justify-center overflow-hidden w-full px-2">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={`${displayFloor}-${isMoving ? (isGoingUp ? 'up' : 'down') : 'idle'}`}
              initial={{ y: isGoingUp ? 28 : -28, opacity: 0, filter: 'blur(4px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: isGoingUp ? -28 : 28, opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-2 justify-center"
            >
              {isMoving && (
                <motion.div
                  animate={{
                    y: isGoingUp ? [0, -5, 0] : [0, 5, 0],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    ease: "easeInOut",
                  }}
                  className={cn(
                    "p-1 rounded-lg flex items-center justify-center shadow-xs",
                    isGoingUp
                      ? "bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                      : "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                  )}
                >
                  {isGoingUp ? (
                    <ArrowUp className="w-5 h-5 stroke-[2.5]" />
                  ) : (
                    <ArrowDown className="w-5 h-5 stroke-[2.5]" />
                  )}
                </motion.div>
              )}
              <span className={cn("text-2xl font-black tracking-tight", theme.text)}>
                {isStoppedOrBlocked ? 'X' : `Tầng ${displayFloor}`}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
        {!isStoppedOrBlocked && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-widest mt-1 flex items-center gap-1">
            {isMoving && (
              <motion.span
                animate={{ y: isGoingUp ? [-2, 0, -2] : [2, 0, 2] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                {isGoingUp ? '▲' : '▼'}
              </motion.span>
            )}
            {direction}
            {lift.source_floor && isWaitingPickup && (
              <span className="text-amber-600 dark:text-amber-400 ml-1 font-extrabold">(Từ Tầng {lift.source_floor})</span>
            )}
          </p>
        )}

        {/* Overlay for floor selection */}
        {showFloorSelector && (
          <div className="absolute inset-0 bg-slate-950/95 z-10 flex flex-col items-center justify-center p-2 rounded-xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between w-full mb-2 px-1 items-center">
              <span className="text-[10px] font-extrabold text-slate-300 uppercase tracking-tight truncate">
                Chọn tầng đến (từ T{lift.current_floor})
              </span>
              <button
                onClick={() => setShowFloorSelector(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded transition-colors shrink-0"
                title="Đóng"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 w-full max-w-full px-1">
              {[1, 2, 3, 4].map(floor => {
                const effectiveAllowed = getEffectiveAllowedFloors(lift);
                const isAllowed = effectiveAllowed.includes(floor);
                const isDisabled = floor === lift.current_floor || !isAllowed;
                return (
                  <button
                    key={floor}
                    disabled={isDisabled}
                    onClick={() => handleSendGoods(floor)}
                    className={cn(
                      "flex-1 max-w-[4rem] h-20 rounded-lg text-xs font-extrabold border transition-all relative cursor-pointer flex items-center justify-center text-center whitespace-nowrap shadow-xs",
                      isDisabled
                        ? "bg-slate-800/80 border-slate-700/60 text-slate-500 cursor-not-allowed"
                        : "bg-blue-600 border-blue-500 text-white hover:bg-blue-500 active:scale-95"
                    )}
                    title={
                      !isAllowed
                        ? `Tầng ${floor} đang bị giới hạn`
                        : (floor === lift.current_floor ? `Tời đang ở Tầng ${floor}` : `Gửi hàng đến Tầng ${floor}`)
                    }
                  >
                    <span>Tầng {floor}</span>
                    {!isAllowed && (
                      <Lock className="w-2.5 h-2.5 absolute top-1 right-1 text-amber-400 opacity-90" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Section */}
      <div className="grid grid-cols-2 gap-2 mt-auto">
        {isStoppedOrBlocked ? (
          <>
            <button
              onClick={() => handleResumeLift(lift)}
              className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold rounded-lg uppercase transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
              title="Cho phép tời tiếp tục di chuyển hoặc trở lại trạng thái sẵn sàng"
            >
              <Play className="w-3.5 h-3.5 fill-white" /> TIẾP TỤC
            </button>
            <button
              onClick={() => setIsDetailsOpen(true)}
              className="py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold rounded-lg uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              CHI TIẾT
            </button>
          </>
        ) : isWaitingPickup ? (
          isAssignedLift && isAssignedFloor ? (
            <div className="col-span-2 flex flex-col gap-1.5">
              <button
                onClick={() => handleConfirmPickup(false)}
                className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-extrabold rounded-lg uppercase transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
              >
                <PackageCheck className="w-3.5 h-3.5" /> XÁC NHẬN ĐÃ LẤY HÀNG
              </button>

              {lift.source_floor && lift.source_floor !== lift.current_floor && (
                <button
                  onClick={() => handleConfirmPickup(true)}
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg uppercase transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                  title={`Lấy hàng xong tự động trả thang về lại Tầng ${lift.source_floor}`}
                >
                  <RotateCcw className="w-3 h-3" /> LẤY & TRẢ TỜI VỀ TẦNG {lift.source_floor}
                </button>
              )}
            </div>
          ) : (
            <div className="col-span-2 p-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-800/80 rounded-xl text-center flex flex-col items-center justify-center">
              <div className="flex items-center gap-1 text-[11px] font-extrabold text-amber-900 dark:text-amber-200 uppercase">
                <Lock className="w-3.5 h-3.5 text-amber-600" /> KHÓA GỌI TỜI
              </div>
              <p className="text-[10px] text-amber-800 dark:text-amber-400 mt-0.5 font-medium leading-tight">
                Tầng {lift.current_floor} chưa lấy hàng. Các tầng khác không thể gọi tời.
              </p>
            </div>
          )
        ) : lift.status === 'AVAILABLE' ? (
          <>
            {(() => {
              const effectiveAllowed = getEffectiveAllowedFloors(lift);
              const userFloor = assignment?.assigned_floor;
              const isCurrentAllowed = effectiveAllowed.includes(lift.current_floor);
              const isUserFloorAllowed = userFloor ? effectiveAllowed.includes(userFloor) : isCurrentAllowed;

              const isSendDisabled = !isAssignedLift || !isAssignedFloor || !isCurrentAllowed;
              const isCallDisabled = !isAssignedLift || (userFloor ? lift.current_floor === userFloor : false) || !isCurrentAllowed || !isUserFloorAllowed;

              return (
                <>
                  <button
                    onClick={() => {
                      if (!isAssignedLift) {
                        toast.error("Bạn không thuộc phân công tời này!");
                        return;
                      }
                      if (!isAssignedFloor) {
                        toast.error(`Tời đang ở Tầng ${lift.current_floor}. Bạn được phân công ở Tầng ${userFloor}, chỉ được gửi hàng khi tời ở tầng của bạn!`);
                        return;
                      }
                      if (!isCurrentAllowed) {
                        toast.error(`🚫 Tầng hiện tại (Tầng ${lift.current_floor}) đã bị Quản lý giới hạn hoạt động đối với tời này! (Tời chỉ phục vụ: ${effectiveAllowed.map(f => `T${f}`).join(', ')})`);
                        return;
                      }
                      setShowFloorSelector(true);
                    }}
                    disabled={isSendDisabled}
                    className={cn(
                      "py-2 text-[11px] font-bold rounded-lg uppercase transition-colors cursor-pointer",
                      isSendDisabled
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-800"
                        : "bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600"
                    )}
                    title={
                      !isCurrentAllowed
                        ? `🚫 Tầng ${lift.current_floor} đã bị Quản lý giới hạn đối với tời này (Chỉ chạy: ${effectiveAllowed.map(f => `T${f}`).join(', ')})`
                        : (!isAssignedFloor ? `Tời ở Tầng ${lift.current_floor} (Bạn ở Tầng ${userFloor})` : "Gửi hàng đến tầng khác")
                    }
                  >
                    {!isCurrentAllowed ? `T${lift.current_floor} BỊ KHÓA` : 'GỬI HÀNG'}
                  </button>
                  <button
                    onClick={handleCallLift}
                    disabled={isCallDisabled}
                    className={cn(
                      "py-2 text-[11px] font-bold rounded-lg uppercase transition-colors cursor-pointer flex items-center justify-center gap-1",
                      isCallDisabled
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                    )}
                    title={
                      userFloor && !isUserFloorAllowed
                        ? `🚫 Tầng ${userFloor} của bạn đã bị Quản lý giới hạn đối với tời này (Chỉ chạy: ${effectiveAllowed.map(f => `T${f}`).join(', ')})`
                        : !isCurrentAllowed
                          ? `🚫 Tầng ${lift.current_floor} hiện tại đã bị Quản lý giới hạn đối với tời này`
                          : (lift.current_floor === userFloor ? "Tời đã ở tầng này" : `Gọi tời về Tầng ${userFloor || 1}`)
                    }
                  >
                    {userFloor && !isUserFloorAllowed
                      ? `T${userFloor} BỊ KHÓA`
                      : (userFloor && lift.current_floor === userFloor ? "Ở TẦNG NÀY" : `GỌI VỀ TẦNG ${userFloor || 1}`)}
                  </button>
                </>
              );
            })()}
          </>
        ) : lift.status === 'RESERVED' ? (
          <button className="col-span-2 py-2 bg-blue-600 dark:bg-blue-500 text-white text-[11px] font-bold rounded-lg uppercase transition-colors">DÙNG TỜI (ĐÃ ĐẶT)</button>
        ) : lift.status === 'LOCKED' ? (
          <div className="col-span-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleToggleLock(lift)}
              className="py-2 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg uppercase transition-colors cursor-pointer"
            >
              MỞ KHÓA TỜI
            </button>
            <button
              onClick={() => setIsDetailsOpen(true)}
              className="py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold rounded-lg uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              CHI TIẾT
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setIsDetailsOpen(true)}
              className="py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold rounded-lg uppercase hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              XEM CHI TIẾT
            </button>
            <button
              onClick={() => handleEmergencyStop(lift)}
              className="py-2 bg-red-600 hover:bg-red-500 text-white text-[11px] font-extrabold rounded-lg uppercase transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
            >
              <AlertOctagon className="w-3.5 h-3.5" /> KHẨN CẤP
            </button>
          </>
        )}
      </div>

      {/* Lift Details Modal */}
      <LiftDetailsModal
        lift={lift}
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        onEmergencyStop={handleEmergencyStop}
        onResumeLift={handleResumeLift}
        onToggleLock={handleToggleLock}
        onReportIssue={() => setIsIssueModalOpen(true)}
      />

      {/* Lift Issue / Maintenance Report Modal */}
      <LiftIssueReportModal
        lift={lift}
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
      />
    </div>
  );
};
