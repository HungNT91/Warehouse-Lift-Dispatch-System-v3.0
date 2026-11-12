import { useState } from 'react';
import { useLiftStore } from '../stores/useLiftStore';
import { useAuthStore } from '../stores/useAuthStore';
import { 
  Server, 
  Search, 
  Lock, 
  Unlock, 
  Wrench,
  AlertTriangle,
  Play,
  Settings2,
  X,
  Clock,
  User as UserIcon,
  ShieldAlert,
  Layers,
  Check
} from 'lucide-react';
import { LiftStatus, Lift } from '../types';
import { getLocalDateString, getEffectiveAllowedFloors, hasActiveFloorRestriction } from '../utils/time';
import { toast } from 'sonner';

export function Lifts() {
  const { lifts, updateLift, addActivity } = useLiftStore();
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingLift, setEditingLift] = useState<Lift | null>(null);
  const [selectedFloors, setSelectedFloors] = useState<number[]>([]);
  const [showOverrideWarning, setShowOverrideWarning] = useState(false);

  const canManage = user?.role === 'Admin' || user?.role === 'Supervisor';

  const filteredLifts = lifts.filter(lift => 
    lift.lift_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: LiftStatus) => {
    switch(status) {
      case 'AVAILABLE': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">SẴN SÀNG</span>;
      case 'WAITING_PICKUP': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">CHỜ LẤY HÀNG</span>;
      case 'MOVING': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">DI CHUYỂN</span>;
      case 'RESERVED': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">ĐÃ ĐẶT</span>;
      case 'LOCKED': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">ĐÃ KHÓA</span>;
      case 'OFFLINE': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">NGOẠI TUYẾN</span>;
      case 'MAINTENANCE': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300">BẢO TRÌ</span>;
      case 'STOPPED': return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400">ĐÃ DỪNG</span>;
      default: return null;
    }
  };

  const handleToggleLock = (id: string, currentStatus: LiftStatus) => {
    if (currentStatus === 'LOCKED') {
      updateLift(id, { status: 'AVAILABLE' });
      toast.success('Đã mở khóa tời!');
    } else {
      updateLift(id, { status: 'LOCKED' });
      toast.info('Đã khóa tời!');
    }
  };

  const handleToggleMaintenance = (id: string, currentStatus: LiftStatus) => {
    if (currentStatus === 'MAINTENANCE') {
      updateLift(id, { status: 'AVAILABLE' });
      toast.success('Đã kết thúc bảo trì tời!');
    } else {
      updateLift(id, { status: 'MAINTENANCE' });
      toast.warning('Đã chuyển tời sang chế độ bảo trì!');
    }
  };

  const handleOpenSettings = (lift: Lift) => {
    setEditingLift(lift);
    const effectiveFloors = getEffectiveAllowedFloors(lift);
    setSelectedFloors(effectiveFloors);
    setShowOverrideWarning(false);
  };

  const handleToggleFloor = (floor: number) => {
    if (selectedFloors.includes(floor)) {
      if (selectedFloors.length === 1) {
        toast.warning('Tời phải có ít nhất 1 tầng được phép hoạt động!');
        return;
      }
      setSelectedFloors(selectedFloors.filter(f => f !== floor));
    } else {
      setSelectedFloors([...selectedFloors, floor].sort((a, b) => a - b));
    }
  };

  const handleSelectAllFloors = () => {
    setSelectedFloors([1, 2, 3, 4]);
  };

  const handleSaveSettingsClick = () => {
    if (!editingLift) return;

    if (selectedFloors.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 tầng hoạt động cho tời!');
      return;
    }

    const isCurrentRestricted = hasActiveFloorRestriction(editingLift);
    const currentRestrictedByName = editingLift.restricted_by_name || 'Quản lý khác';
    const currentRestrictedById = editingLift.restricted_by_user_id;
    const currentUserName = user?.full_name || user?.name || 'Quản lý';
    const currentUserId = user?.id;

    // Kiểm tra nếu thang đã được giới hạn bởi một Quản lý khác trước đó trong ngày
    const isSetByAnotherManager = Boolean(
      isCurrentRestricted &&
      ((currentRestrictedById && currentRestrictedById !== currentUserId) ||
       (currentRestrictedByName && currentRestrictedByName !== currentUserName))
    );

    if (isSetByAnotherManager && !showOverrideWarning) {
      setShowOverrideWarning(true);
      return;
    }

    executeSaveSettings();
  };

  const executeSaveSettings = () => {
    if (!editingLift) return;

    const isAllFloors = selectedFloors.length >= 4;
    const currentUserName = user?.full_name || user?.name || 'Quản lý';
    const currentUserId = user?.id || 'u1';
    const nowIso = new Date().toISOString();
    const todayStr = getLocalDateString();

    const updates: Partial<Lift> = {
      allowed_floors: isAllFloors ? [1, 2, 3, 4] : [...selectedFloors].sort((a, b) => a - b),
      restricted_by_user_id: isAllFloors ? null : currentUserId,
      restricted_by_name: isAllFloors ? null : currentUserName,
      restricted_at: isAllFloors ? null : nowIso,
      restriction_date: isAllFloors ? null : todayStr
    };

    updateLift(editingLift.id, updates);

    // Ghi log hoạt động
    const liftName = editingLift.lift_number ? editingLift.lift_number.replace('Lift ', 'Tời ') : 'Tời';
    const logText = isAllFloors
      ? `Quản lý ${currentUserName} đã mở lại tất cả các tầng (1-4) cho ${liftName}`
      : `Quản lý ${currentUserName} đã thiết lập giới hạn ${liftName} chỉ hoạt động tại các tầng: ${selectedFloors.join(', ')} (Hiệu lực trong ngày)`;

    addActivity({
      user_id: currentUserId,
      action: 'SET_FLOOR_RESTRICTION',
      entity: 'lift',
      entity_id: editingLift.id,
      description: logText
    });

    toast.success(
      isAllFloors 
        ? `Đã khôi phục cho ${liftName} di chuyển tất cả các tầng!`
        : `Đã thiết lập ${liftName} chỉ di chuyển ở Tầng ${selectedFloors.join(', ')}!`
    );

    setEditingLift(null);
    setShowOverrideWarning(false);
  };

  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-12 w-full max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-slate-900 dark:text-white">Chi Tiết Giám Sát Tời</h1>
            <p className="text-xs font-medium text-slate-500">Quản lý trạng thái, cài đặt giới hạn tầng và điều khiển thiết bị</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Tìm tên tời..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white sm:text-sm transition-colors"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col w-full">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th scope="col" className="px-5 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Thiết Bị
                </th>
                <th scope="col" className="px-4 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Trạng Thái
                </th>
                <th scope="col" className="px-4 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Vị Trí Hiện Tại
                </th>
                <th scope="col" className="px-5 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Giới Hạn Tầng Trong Ngày
                </th>
                <th scope="col" className="px-4 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Thông Tin
                </th>
                <th scope="col" className="px-5 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
              {filteredLifts.map((lift) => {
                const effectiveFloors = getEffectiveAllowedFloors(lift);
                const isRestricted = hasActiveFloorRestriction(lift);

                return (
                  <tr key={lift.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                            lift.status === 'AVAILABLE' ? 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' :
                            lift.status === 'MOVING' ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' :
                            lift.status === 'WAITING_PICKUP' ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400' :
                            lift.status === 'MAINTENANCE' || lift.status === 'OFFLINE' ? 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700' :
                            'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400'
                          }`}>
                            <Server className="w-5 h-5" />
                          </div>
                        </div>
                        <div className="ml-3.5">
                          <div className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                            {lift.lift_number.replace('Lift ', 'Tời ')}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Mã: {lift.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {getStatusBadge(lift.status)}
                      {lift.status === 'MOVING' && (
                        <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all duration-1000 ease-linear" style={{ width: `${lift.progress}%` }}></div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        Tầng {lift.current_floor} {lift.destination_floor ? `→ Tầng ${lift.destination_floor}` : ''}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {lift.status === 'MOVING' ? 'Đang di chuyển' : 'Đang dừng'}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      {isRestricted ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 w-fit">
                            <Lock className="w-3 h-3 text-amber-600" />
                            CHỈ CHẠY: {effectiveFloors.map(f => `T${f}`).join(', ')}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                            <UserIcon className="w-3 h-3 text-slate-400" />
                            {lift.restricted_by_name || 'Quản lý'} • Reset sau 00:00
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 w-fit">
                            Tất cả các tầng (1 - 4)
                          </span>
                          <span className="text-[10px] text-slate-400">Không bị giới hạn</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 dark:text-white">
                        {lift.current_job_id ? `Việc #${lift.current_job_id}` : (lift.operator ? `NV: ${lift.operator}` : 'Rảnh')}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Cập nhật: {lift.last_update}
                      </div>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {canManage && (
                          <>
                            <button 
                              onClick={() => handleToggleLock(lift.id, lift.status)}
                              className={`p-2 rounded-lg transition-colors border ${
                                lift.status === 'LOCKED' 
                                  ? 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400' 
                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                              }`}
                              title={lift.status === 'LOCKED' ? 'Mở Khóa Tời' : 'Khóa Tời'}
                            >
                              {lift.status === 'LOCKED' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={() => handleToggleMaintenance(lift.id, lift.status)}
                              className={`p-2 rounded-lg transition-colors border ${
                                lift.status === 'MAINTENANCE' 
                                  ? 'bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300' 
                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                              }`}
                              title={lift.status === 'MAINTENANCE' ? 'Kết Thúc Bảo Trì' : 'Bảo Trì'}
                            >
                              {lift.status === 'MAINTENANCE' ? <Play className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                            </button>
                            <button 
                              onClick={() => handleOpenSettings(lift)}
                              className={`p-2 rounded-lg transition-colors border ${
                                isRestricted 
                                  ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-300'
                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                              }`}
                              title="Cài Đặt Giới Hạn Tầng"
                            >
                              <Settings2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-slate-200 dark:divide-slate-800 w-full overflow-y-auto">
          {filteredLifts.map((lift) => {
            const effectiveFloors = getEffectiveAllowedFloors(lift);
            const isRestricted = hasActiveFloorRestriction(lift);

            return (
              <div key={lift.id} className="p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                      lift.status === 'AVAILABLE' ? 'bg-green-50 border-green-200 text-green-600 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400' :
                      lift.status === 'MOVING' ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400' :
                      lift.status === 'WAITING_PICKUP' ? 'bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/30 dark:border-orange-800 dark:text-orange-400' :
                      lift.status === 'MAINTENANCE' || lift.status === 'OFFLINE' ? 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700' :
                      'bg-purple-50 border-purple-200 text-purple-600 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400'
                    }`}>
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white uppercase">{lift.lift_number.replace('Lift ', 'Tời ')}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Mã: {lift.id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(lift.status)}
                  </div>
                </div>
                
                {lift.status === 'MOVING' && (
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-1000 ease-linear" style={{ width: `${lift.progress}%` }}></div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Vị Trí</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                      Tầng {lift.current_floor} {lift.destination_floor ? `→ ${lift.destination_floor}` : ''}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {lift.status === 'MOVING' ? 'Đang di chuyển' : 'Đang dừng'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Giới Hạn Tầng</div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                      {isRestricted ? `Chỉ: ${effectiveFloors.map(f => `T${f}`).join(', ')}` : 'Tất cả các tầng'}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {isRestricted ? `Bởi: ${lift.restricted_by_name || 'QL'}` : 'Tự do'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-1">
                  {canManage && (
                    <>
                      <button 
                        onClick={() => handleToggleLock(lift.id, lift.status)}
                        className={`p-2 rounded-lg transition-colors border ${
                          lift.status === 'LOCKED' 
                            ? 'bg-purple-50 border-purple-200 text-purple-600 hover:bg-purple-100 dark:bg-purple-900/30 dark:border-purple-800 dark:text-purple-400' 
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                        title={lift.status === 'LOCKED' ? 'Mở Khóa Tời' : 'Khóa Tời'}
                      >
                        {lift.status === 'LOCKED' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => handleToggleMaintenance(lift.id, lift.status)}
                        className={`p-2 rounded-lg transition-colors border ${
                          lift.status === 'MAINTENANCE' 
                            ? 'bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300' 
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                        title={lift.status === 'MAINTENANCE' ? 'Kết Thúc Bảo Trì' : 'Bảo Trì'}
                      >
                        {lift.status === 'MAINTENANCE' ? <Play className="w-4 h-4" /> : <Wrench className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => handleOpenSettings(lift)}
                        className={`p-2 rounded-lg transition-colors border ${
                          isRestricted 
                            ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/40 dark:border-amber-700 dark:text-amber-300'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                        }`}
                        title="Cài Đặt Giới Hạn Tầng"
                      >
                        <Settings2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredLifts.length === 0 && (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            Không tìm thấy thiết bị nào phù hợp.
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {editingLift && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white uppercase tracking-tight">
                    Cài Đặt Giới Hạn Tầng Tời
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Thiết bị: <strong className="text-slate-900 dark:text-white">{editingLift.lift_number.replace('Lift ', 'Tời ')}</strong>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setEditingLift(null);
                  setShowOverrideWarning(false);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Existing active restriction info if any */}
              {hasActiveFloorRestriction(editingLift) && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 dark:text-amber-200">
                    <p className="font-bold">Đang có giới hạn tầng hoạt động trong ngày:</p>
                    <p className="mt-0.5">
                      Chỉ cho phép chạy: <strong>Tầng {getEffectiveAllowedFloors(editingLift).join(', ')}</strong>
                    </p>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <UserIcon className="w-3 h-3" />
                      Thiết lập bởi: <strong>{editingLift.restricted_by_name || 'Quản lý'}</strong>
                      {editingLift.restricted_at && ` (lúc ${new Date(editingLift.restricted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Chọn các tầng tời được phép di chuyển:
                  </span>
                  <button
                    onClick={handleSelectAllFloors}
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Chọn tất cả (1-4)
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[1, 2, 3, 4].map(floor => {
                    const isSelected = selectedFloors.includes(floor);
                    return (
                      <button
                        key={floor}
                        type="button"
                        onClick={() => handleToggleFloor(floor)}
                        className={`p-3.5 rounded-2xl border-2 font-black text-sm transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/80 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-300 shadow-xs'
                            : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500'
                        }`}
                      >
                        <span>Tầng {floor}</span>
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-blue-600 dark:bg-blue-500 text-white flex items-center justify-center">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-300 dark:border-slate-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Note about 00:00 midnight auto reset */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2">
                <Clock className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Quy định tự động:</strong> Giới hạn tầng chỉ có hiệu lực trong ngày hôm nay. Qua <strong>12h đêm (00:00)</strong>, hệ thống sẽ tự động khôi phục cho phép tời di chuyển qua tất cả các tầng (1-4).
                </span>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                onClick={() => {
                  setEditingLift(null);
                  setShowOverrideWarning(false);
                }}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveSettingsClick}
                className="px-6 py-2.5 text-xs font-black text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer uppercase tracking-wider"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Warning Modal when another manager already restricted this lift */}
      {showOverrideWarning && editingLift && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-300 dark:border-amber-700/80 animate-in zoom-in-95 duration-150">
            <div className="p-6 flex flex-col gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <ShieldAlert className="w-7 h-7" />
              </div>
              
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Cảnh Báo Thay Đổi Giới Hạn Tầng
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  Thang <strong>{editingLift.lift_number.replace('Lift ', 'Tời ')}</strong> hiện đang được thiết lập giới hạn tầng bởi Quản lý: <strong className="text-amber-600 dark:text-amber-400">{editingLift.restricted_by_name || 'Khác'}</strong>
                  {editingLift.restricted_at && ` (lúc ${new Date(editingLift.restricted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                  .
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed">
                  Cấu hình mới bạn chọn: <strong>Tầng {selectedFloors.join(', ')}</strong>.
                </p>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 mt-2">
                  Bạn có chắc chắn muốn ghi đè và thay đổi thiết lập giới hạn tầng của Quản lý trước đó không?
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideWarning(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="button"
                  onClick={executeSaveSettings}
                  className="px-5 py-2.5 text-xs font-black text-white bg-amber-600 hover:bg-amber-500 rounded-xl shadow-md shadow-amber-600/20 uppercase tracking-wider transition-all cursor-pointer"
                >
                  Xác Nhận Thay Đổi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

