import React, { useState } from 'react';
import { Lift } from '../../types';
import { useLiftStore } from '../../stores/useLiftStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, AlertOctagon, AlertCircle, X, ShieldAlert, Clock, User, Layers, Send } from 'lucide-react';
import { toast } from 'sonner';

interface LiftIssueReportModalProps {
    lift: Lift;
    isOpen: boolean;
    onClose: () => void;
}

export const LiftIssueReportModal: React.FC<LiftIssueReportModalProps> = ({ lift, isOpen, onClose }) => {
    const { user, assignment } = useAuthStore();
    const { updateLift, addActivity } = useLiftStore();
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const liftName = lift.lift_number ? (lift.lift_number.startsWith('Lift') ? lift.lift_number.replace('Lift ', 'Thang Tời ') : lift.lift_number) : `Thang Tời #${lift.id}`;
    const nowStr = new Date().toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const reporterName = user?.full_name || user?.name || 'Nhân viên kho';
    const reporterRole = user?.role === 'Admin' ? 'Quản trị viên' : user?.role === 'Supervisor' ? 'Giám sát kho' : 'Nhân viên kho';
    const floorInfo = assignment?.assigned_floor ? ` (Tầng ${assignment.assigned_floor})` : '';
    const fullReporterStr = `${reporterName} - ${reporterRole}${floorInfo}`;

    const handleReportIssue = async (issueType: 'SỰ CỐ DỪNG ĐỘT NGỘT' | 'THANG KHÔNG HOẠT ĐỘNG') => {
        setIsSubmitting(true);
        try {
            const issueLabel = issueType === 'SỰ CỐ DỪNG ĐỘT NGỘT' ? '⛔ DỪNG ĐỘT NGỘT' : '🔌 KHÔNG HOẠT ĐỘNG / MẤT KẾT NỐI';

            // 1. Update lift status in store
            const newStatus = issueType === 'SỰ CỐ DỪNG ĐỘT NGỘT' ? 'STOPPED' : 'MAINTENANCE';
            updateLift(lift.id, {
                status: newStatus,
                operator: reporterName
            });

            // 2. Log System Activity
            addActivity({
                user_id: user?.id || 'u1',
                action: 'SỰ CỐ THANG',
                entity: 'lift',
                entity_id: liftName,
                description: `Báo cảnh báo: [${issueType}] tại Tầng ${lift.current_floor} bởi ${fullReporterStr}`
            });

            toast.success(`🚨 Đã báo cáo sự cố "${issueType}" thành công!`, {
                description: `Thang ${liftName} đã chuyển sang trạng thái ${newStatus === 'STOPPED' ? 'ĐÃ DỪNG' : 'BẢO TRÌ'}.`
            });

            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi gửi cảnh báo!');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-200 dark:border-rose-900/50 overflow-hidden"
                >
                    {/* Header Banner */}
                    <div className="bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 p-5 text-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-2xl">
                                <ShieldAlert className="w-6 h-6 text-white animate-bounce" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black uppercase tracking-wide">Cảnh Báo Sự Cố Thang</h3>
                                <p className="text-xs text-rose-100">Gửi thông báo khẩn cấp tới Đội Bảo Trì Kỹ Thuật</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-5">
                        {/* Context Info Card */}
                        <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/60 space-y-2">
                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-2">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
                                    <Layers className="w-3.5 h-3.5 text-blue-500" /> Thiết bị:
                                </span>
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                    {liftName} <span className="text-xs text-slate-400 font-normal">({lift.lift_code || 'ID #' + lift.id})</span>
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-2">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-amber-500" /> Vị trí & Thời gian:
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                    Tầng {lift.current_floor} • {nowStr}
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400 font-bold flex items-center gap-1.5">
                                    <User className="w-3.5 h-3.5 text-emerald-500" /> Nhân viên báo:
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[220px]" title={fullReporterStr}>
                                    {fullReporterStr}
                                </span>
                            </div>
                        </div>

                        {/* Title Selection */}
                        <div>
                            <p className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-amber-500" /> Chọn loại sự cố để gửi cảnh báo:
                            </p>

                            <div className="grid grid-cols-1 gap-3">
                                {/* Option 1: Dừng đột ngột */}
                                <button
                                    onClick={() => handleReportIssue('SỰ CỐ DỪNG ĐỘT NGỘT')}
                                    disabled={isSubmitting}
                                    className="group relative p-4 text-left bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 border-2 border-rose-200 dark:border-rose-900/80 hover:border-rose-500 rounded-2xl transition-all shadow-xs cursor-pointer flex items-start gap-3.5"
                                >
                                    <div className="p-3 bg-rose-500 text-white rounded-xl shadow-md group-hover:scale-105 transition-transform flex-shrink-0">
                                        <AlertOctagon className="w-6 h-6 animate-pulse" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-black text-rose-900 dark:text-rose-200 uppercase tracking-tight">
                                                1. Thang sự cố dừng đột ngột
                                            </h4>
                                            <Send className="w-4 h-4 text-rose-500 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                        <p className="text-xs text-rose-700/80 dark:text-rose-300/80 mt-1 leading-relaxed">
                                            Thang bị giật, kẹt dừng đột ngột khi đang di chuyển. Tự động chuyển thang sang trạng thái <b>ĐÃ DỪNG</b> và gửi cảnh báo khẩn tới Đội Bảo Trì.
                                        </p>
                                    </div>
                                </button>

                                {/* Option 2: Thang không hoạt động */}
                                <button
                                    onClick={() => handleReportIssue('THANG KHÔNG HOẠT ĐỘNG')}
                                    disabled={isSubmitting}
                                    className="group relative p-4 text-left bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 border-2 border-amber-200 dark:border-amber-900/80 hover:border-amber-500 rounded-2xl transition-all shadow-xs cursor-pointer flex items-start gap-3.5"
                                >
                                    <div className="p-3 bg-amber-500 text-white rounded-xl shadow-md group-hover:scale-105 transition-transform flex-shrink-0">
                                        <AlertCircle className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-black text-amber-900 dark:text-amber-200 uppercase tracking-tight">
                                                2. Thang không hoạt động
                                            </h4>
                                            <Send className="w-4 h-4 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                        <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-1 leading-relaxed">
                                            Thang bị mất nguồn, mất kết nối, treo không chạy khi gọi. Tự động chuyển thang sang trạng thái <b>BẢO TRÌ</b> và báo Đội Kỹ Thuật.
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer note */}
                    <div className="p-4 bg-slate-100 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                        <span>Đội Kỹ Thuật sẽ nhận được tin nhắn qua Telegram & Nhật ký Hệ thống</span>
                        <button
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
                        >
                            Hủy Bỏ
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
