import React from 'react';
import { Lift, Job } from '../../types';
import { useLiftStore } from '../../stores/useLiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { isSameLift, getEffectiveAllowedFloors, hasActiveFloorRestriction } from '../../utils/time';
import {
  X,
  Play,
  AlertOctagon,
  Lock,
  Unlock,
  Clock,
  ArrowRight,
  User,
  Package,
  CheckCircle2,
  XCircle,
  Activity,
  History,
  Layers,
  FileText
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface LiftDetailsModalProps {
  lift: Lift;
  isOpen: boolean;
  onClose: () => void;
  onEmergencyStop: (lift: Lift) => void;
  onResumeLift: (lift: Lift) => void;
  onToggleLock: (lift: Lift) => void;
  onReportIssue?: () => void;
}

const statusThemes: Record<string, { bg: string; text: string; label: string }> = {
  'AVAILABLE': { bg: 'bg-emerald-100 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-400', label: 'SẴN SÀNG' },
  'WAITING_PICKUP': { bg: 'bg-amber-100 dark:bg-amber-900/50 border-amber-300 dark:border-amber-800', text: 'text-amber-800 dark:text-amber-300', label: 'CHỜ LẤY HÀNG' },
  'MOVING': { bg: 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', label: 'ĐANG DI CHUYỂN' },
  'RESERVED': { bg: 'bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-400', label: 'ĐÃ ĐẶT' },
  'LOCKED': { bg: 'bg-purple-100 dark:bg-purple-900/40 border-purple-300 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-400', label: 'ĐÃ KHÓA' },
  'OFFLINE': { bg: 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700', text: 'text-slate-600 dark:text-slate-400', label: 'NGOẠI TUYẾN' },
  'MAINTENANCE': { bg: 'bg-red-100 dark:bg-red-900/40 border-red-300 dark:border-red-800', text: 'text-red-700 dark:text-red-400', label: 'BẢO TRÌ' },
  'STOPPED': { bg: 'bg-rose-100 dark:bg-rose-900/40 border-rose-300 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-400', label: 'ĐÃ DỪNG KHẨN CẤP' },
};

export const LiftDetailsModal: React.FC<LiftDetailsModalProps> = ({
  lift: initialLift,
  isOpen,
  onClose,
  onEmergencyStop,
  onResumeLift,
  onToggleLock,
  onReportIssue
}) => {
  const { jobs, lifts } = useLiftStore();
  const { user } = useAuthStore();
  const canLock = user?.role === 'Supervisor' || user?.role === 'Admin';

  if (!isOpen) return null;

  // Sync with store's latest lift state
  const lift = lifts.find(l => isSameLift(l.id, initialLift.id) || isSameLift(l.lift_number, initialLift.lift_number)) || initialLift;

  // List of old static mock employee names to avoid displaying as real operators
  const mockNames = ['Thanh H.', 'Hùng Đ.', 'Minh T.', 'Đội Kỹ Thuật', 'Phạm Lan Trang'];

  // Find jobs related to this lift using robust isSameLift matching
  const liftJobs = jobs
    .filter((j) => isSameLift(j.lift_id, lift.id) || isSameLift(j.lift_id, lift.lift_number))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Active job currently running or waiting on this lift
  const activeJob = lift.status === 'AVAILABLE'
    ? null
    : liftJobs.find(j =>
        (lift.current_job_id && (j.id === lift.current_job_id || j.code === lift.current_job_id)) ||
        ['MOVING', 'WAITING_PICKUP'].includes(j.status)
      ) || null;

  // Derive real destination floor from lift state or active job
  const effectiveDestFloor = lift.destination_floor || activeJob?.target_floor || (activeJob as any)?.to_floor || null;

  // Derive real operator name from lift operator, active job creator, or current user
  let operatorName = 'Chưa có';
  if (lift.status !== 'AVAILABLE') {
    if (lift.operator && !mockNames.includes(lift.operator)) {
      operatorName = lift.operator;
    } else if (activeJob?.creator_name && !mockNames.includes(activeJob.creator_name)) {
      operatorName = activeJob.creator_name;
    } else if (user) {
      operatorName = user.full_name || (user.role === 'Admin' ? 'Admin' : user.role === 'Supervisor' ? 'Giám sát kho' : 'Nhân viên kho');
    } else if (lift.operator) {
      operatorName = lift.operator;
    } else {
      operatorName = 'Nhân viên kho';
    }
  }

  const theme = statusThemes[lift.status] || statusThemes['AVAILABLE'];
  const isStoppedOrBlocked = ['STOPPED', 'MAINTENANCE', 'LOCKED', 'OFFLINE'].includes(lift.status);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl border border-blue-100 dark:border-blue-800">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                  {lift.lift_number.replace('Lift ', 'Tời ')}
                </h2>
                <span className={cn("px-2.5 py-0.5 text-xs font-black rounded-full border uppercase", theme.bg, theme.text)}>
                  {theme.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mã thiết bị: <span className="font-mono font-semibold">{lift.id}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Main Specs Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tầng Gửi</span>
              <span className="text-lg font-black text-slate-900 dark:text-white">Tầng {lift.current_floor}</span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tầng Đích</span>
              <span className="text-lg font-black text-blue-600 dark:text-blue-400">
                {effectiveDestFloor ? `Tầng ${effectiveDestFloor}` : 'Không có'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Tiến Độ Hành Trình</span>
              <span className="text-lg font-black text-slate-900 dark:text-white">
                {lift.status === 'MOVING' ? `${Math.round(lift.progress)}%` : '--'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Người Thực Hiện / Gửi</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate block" title={operatorName}>
                {operatorName}
              </span>
            </div>
          </div>

          {/* Floor Restriction Info Box */}
          {(() => {
            const effectiveFloors = getEffectiveAllowedFloors(lift);
            const isRestricted = hasActiveFloorRestriction(lift);

            return (
              <div className={cn(
                "p-3.5 rounded-2xl border flex items-start gap-3 text-xs",
                isRestricted 
                  ? "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200"
                  : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
              )}>
                <div className={cn(
                  "p-2 rounded-xl shrink-0",
                  isRestricted ? "bg-amber-100 dark:bg-amber-900/60 text-amber-600" : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                )}>
                  <Lock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wide">
                      {isRestricted ? 'Giới Hạn Tầng Hoạt Động Trong Ngày' : 'Phạm Vi Di Chuyển Của Tời'}
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/10 dark:bg-white/10 uppercase">
                      {isRestricted ? `Chỉ Tầng ${effectiveFloors.join(', ')}` : 'Tất cả tầng (1-4)'}
                    </span>
                  </div>
                  {isRestricted ? (
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
                      Thiết lập bởi Quản lý <strong>{lift.restricted_by_name || 'Khác'}</strong>
                      {lift.restricted_at && ` vào lúc ${new Date(lift.restricted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}.
                      Thang chỉ được phép di chuyển và nhận đơn giữa các tầng <strong>{effectiveFloors.map(f => `Tầng ${f}`).join(' và ')}</strong>. Hệ thống sẽ tự động khôi phục di chuyển tất cả tầng sau <strong>00:00 đêm</strong>.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Tời đang được phép vận chuyển và gọi thang tự do tại tất cả các tầng (Tầng 1, 2, 3, 4).
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Progress Bar if MOVING */}
          {lift.status === 'MOVING' && (
            <div className="p-4 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl">
              <div className="flex justify-between items-center mb-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                <span>Đang di chuyển: Tầng {lift.source_floor || lift.current_floor} ➔ Tầng {lift.destination_floor}</span>
                <span>{Math.round(lift.progress)}%</span>
              </div>
              <div className="w-full bg-blue-200 dark:bg-blue-900/60 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-600 dark:bg-blue-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${lift.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Stopped Emergency Banner if STOPPED */}
          {isStoppedOrBlocked && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl flex items-start gap-3">
              <AlertOctagon className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-bold text-red-900 dark:text-red-300 uppercase">
                  {lift.status === 'STOPPED' ? 'TỜI ĐÃ BỊ DỪNG KHẨN CẤP' : `TỜI ĐANG TRONG TRẠNG THÁI ${theme.label}`}
                </h4>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                  Tời đã tạm dừng mọi thao tác di chuyển tự động. Kiểm tra an toàn trước khi bấm nút tiếp tục di chuyển.
                </p>
                <button
                  onClick={() => {
                    onResumeLift(lift);
                    onClose();
                  }}
                  className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl uppercase flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Play className="w-4 h-4 fill-white" /> TIẾP TỤC DI CHUYỂN / KHÔI PHỤC HOẠT ĐỘNG
                </button>
              </div>
            </div>
          )}

          {/* Active Job Details */}
          <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" /> Công Việc Hiện Tại
            </h3>

            {activeJob ? (
              <div className="space-y-2 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">#{activeJob.id}</span>
                  <span className="px-2 py-0.5 rounded-md font-bold text-[10px] uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    {activeJob.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Hành trình:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Tầng {activeJob.source_floor} ➔ Tầng {activeJob.target_floor}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Người gửi:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{(!mockNames.includes(activeJob.creator_name || '')) ? (activeJob.creator_name || operatorName) : operatorName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Loại hàng:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{activeJob.item_type || 'Pallet Hàng'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Thời gian tạo:</span>
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {new Date(activeJob.created_at).toLocaleTimeString('vi-VN')}
                    </span>
                  </div>
                </div>
                {activeJob.notes && (
                  <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100 dark:border-slate-800">
                    Ghi chú: "{activeJob.notes}"
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-2">Hiện tại không có công việc vận chuyển nào active.</p>
            )}
          </div>

          {/* Transport History List */}
          <div>
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <History className="w-4 h-4 text-blue-600" /> Lịch Sử Vận Chuyển Gần Đây ({liftJobs.length})
            </h3>

            {liftJobs.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {liftJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
                          <span>Tầng {job.source_floor}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span>Tầng {job.target_floor}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {job.creator_name} • {new Date(job.created_at).toLocaleString('vi-VN')}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md font-bold text-[10px] uppercase",
                      job.status === 'COMPLETED' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" :
                        job.status === 'CANCELLED' ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" :
                          "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                    )}>
                      {job.status === 'COMPLETED' ? 'Hoàn thành' : job.status === 'CANCELLED' ? 'Đã hủy' : job.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                Chưa có dữ liệu lịch sử vận chuyển cho tời này.
              </p>
            )}
          </div>
        </div>

        {/* Footer Controls */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {onReportIssue && (
              <button
                onClick={() => {
                  onClose();
                  onReportIssue();
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold rounded-xl uppercase flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <AlertOctagon className="w-4 h-4" /> BÁO SỰ CỐ
              </button>
            )}

            {isStoppedOrBlocked ? (
              <button
                onClick={() => {
                  onResumeLift(lift);
                  onClose();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold rounded-xl uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" /> TIẾP TỤC DI CHUYỂN
              </button>
            ) : (
              <button
                onClick={() => {
                  onEmergencyStop(lift);
                  onClose();
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold rounded-xl uppercase flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <AlertOctagon className="w-4 h-4" /> DỪNG KHẨN CẤP
              </button>
            )}

            {canLock && (
              <button
                onClick={() => {
                  onToggleLock(lift);
                }}
                className="px-3.5 py-2 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {lift.status === 'LOCKED' ? (
                  <>
                    <Unlock className="w-3.5 h-3.5" /> MỞ KHÓA TỜI
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" /> KHÓA TỜI
                  </>
                )}
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl uppercase transition-colors cursor-pointer"
          >
            ĐÓNG
          </button>
        </div>
      </div>
    </div>
  );
};
