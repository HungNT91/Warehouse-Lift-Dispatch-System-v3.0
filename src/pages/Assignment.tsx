import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useLiftStore } from '../stores/useLiftStore';
import { db } from '../api/dbClient';
import { Package, ArrowRight, CheckCircle2, Warehouse, LogOut, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Assignment } from '../types';

export function AssignmentPage() {
  const navigate = useNavigate();
  const { user, setAssignment, logout } = useAuthStore();
  const { lifts } = useLiftStore();
  const [selectedLift, setSelectedLift] = useState<string | null>(lifts[0]?.id || null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!selectedLift || !selectedFloor || !user) return;

    setIsSubmitting(true);
    try {
      const assignmentData = await db.dailyAssignments.create({
        user_id: user.id,
        lift_id: selectedLift,
        floor_id: `f${selectedFloor}`,
        work_date: new Date().toISOString().split('T')[0],
        shift: 'MORNING'
      });

      const selectedLiftObj = lifts.find(l => l.id === selectedLift);
      const liftName = selectedLiftObj ? selectedLiftObj.lift_number.replace('Lift ', 'Tời ') : 'Tời';

      await db.activityLogs.add({
        user_id: user.id,
        action: 'ASSIGN_SHIFT',
        table_name: 'daily_assignments',
        record_id: liftName,
        description: `Nhân viên ${user.full_name} đã phân công phụ trách ${liftName} - Tầng ${selectedFloor}`,
        event_type: 'USER_EVENT'
      }).catch(console.error);

      setAssignment({
        id: assignmentData.id,
        user_id: user.id,
        lift_id: selectedLift,
        assigned_floor: selectedFloor,
        work_date: new Date().toISOString().split('T')[0],
        created_at: assignmentData.created_at,
        updated_at: assignmentData.created_at
      } as Assignment);

      toast.success(`Đã lưu phân công ${liftName} - Tầng ${selectedFloor}`);
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'Lỗi: Không thể nhận ca');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
              <Warehouse className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-slate-900 dark:text-white">W.L.D.S</h1>
              <p className="text-xs font-medium text-slate-500">Hệ Thống Quản Lý Thang Tời Kho</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </header>

        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6 md:p-8 border-b border-slate-100 dark:border-slate-800 text-center">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-slate-900 dark:text-white mb-2">
              Xin chào, {user?.full_name || 'Nhân viên'}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-lg mx-auto text-sm">
              Mỗi nhân viên được quy định phụ trách <strong className="text-blue-600 dark:text-blue-400">1 Thang ở 1 Tầng duy nhất</strong> trong suốt ca làm việc.
            </p>
          </div>

          <div className="p-6 md:p-8 bg-slate-50/50 dark:bg-slate-900/50 space-y-8">
            {/* Step 1: Select Lift */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" /> Bước 1: Chọn Thang
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[...lifts]
                  .sort((a, b) => a.lift_number.localeCompare(b.lift_number, undefined, { numeric: true, sensitivity: 'base' }))
                  .map((lift) => {
                    const isMaintenance = lift.status === 'MAINTENANCE';
                    const isSelected = selectedLift === lift.id;

                    return (
                      <button
                        key={lift.id}
                        disabled={isMaintenance}
                        onClick={() => setSelectedLift(lift.id)}
                        className={`relative p-4 rounded-2xl border-2 text-left transition-all ${isMaintenance
                            ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50'
                            : isSelected
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-md shadow-blue-500/10'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer'
                          }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3 right-3 text-blue-600 dark:text-blue-400">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                        )}
                        <Package className={`w-6 h-6 mb-2 ${isMaintenance ? 'text-slate-400' : isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`} />
                        <h3 className={`font-bold text-base ${isMaintenance ? 'text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                          {lift.lift_number.replace('Lift ', 'Tời ')}
                        </h3>
                        <p className={`text-[10px] mt-0.5 font-bold uppercase tracking-wider ${isMaintenance ? 'text-slate-400' : isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-500'}`}>
                          {lift.status === 'AVAILABLE' ? 'SẴN SÀNG' : lift.status === 'MAINTENANCE' ? 'BẢO TRÌ' : lift.status}
                        </p>
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Step 2: Select Floor */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" /> Bước 2: Chọn Tầng Phụ Trách (Thao tác duy nhất)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((floor) => {
                  const isSelected = selectedFloor === floor;
                  return (
                    <button
                      key={floor}
                      onClick={() => setSelectedFloor(floor)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all cursor-pointer ${isSelected
                          ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/20 font-black'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:border-blue-300 font-bold'
                        }`}
                    >
                      <span className="text-xl block">Tầng {floor}</span>
                      <span className={`text-[10px] uppercase tracking-wider ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                        {isSelected ? 'ĐÃ CHỌN' : 'CHỌN TẦNG'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Summary Banner */}
            {selectedLift && selectedFloor && (
              <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Xác Nhận Phân Công</div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                    {lifts.find(l => l.id === selectedLift)?.lift_number.replace('Lift ', 'Tời ')} — Tầng {selectedFloor}
                  </div>
                </div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 text-right max-w-[200px]">
                  Bạn chỉ được phép thực hiện thao tác gửi/lấy hàng tại Tầng {selectedFloor}.
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleConfirm}
                disabled={!selectedLift || !selectedFloor || isSubmitting}
                className="flex items-center gap-2 px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
              >
                Vào Ca Làm Việc {isSubmitting ? '...' : <ArrowRight className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
