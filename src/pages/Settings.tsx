import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Bell,
  Volume2,
  User,
  Shield,
  Bot,
  Save,
  Moon,
  Sun,
  Monitor,
  Clock,
  Database,
  RefreshCw,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';
import { useTheme } from '../components/ThemeProvider';
import { useAuthStore } from '../stores/useAuthStore';
import { db, syncGoogleSheetData } from '../api/dbClient';
import { GOOGLE_SHEET_API_URL, isGoogleSheetConfigured } from '../config/sheetConfig';
import { toast } from 'sonner';

type Tab = 'general' | 'notifications' | 'system' | 'database' | 'account';

export function Settings() {
  const { theme, setTheme } = useTheme();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // System & Shift Settings state
  const [shiftMorningStart, setShiftMorningStart] = useState('06:00');
  const [shiftMorningEnd, setShiftMorningEnd] = useState('14:00');
  const [shiftAfternoonStart, setShiftAfternoonStart] = useState('14:00');
  const [shiftAfternoonEnd, setShiftAfternoonEnd] = useState('22:00');
  const [shiftNightStart, setShiftNightStart] = useState('22:00');
  const [shiftNightEnd, setShiftNightEnd] = useState('06:00');

  // Lift Parameters state
  const [cargoWarningTimeout, setCargoWarningTimeout] = useState('2');
  const [liftSpeedPerFloor, setLiftSpeedPerFloor] = useState('20');
  const [maxLiftLoad, setMaxLiftLoad] = useState('1000');
  const [maintenanceInterval, setMaintenanceInterval] = useState('30');
  const [autoReturnFloor, setAutoReturnFloor] = useState('1');
  const [autoLockOverload, setAutoLockOverload] = useState(true);

  // Account settings state
  const [accountFullName, setAccountFullName] = useState(user?.full_name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (user?.full_name) {
      setAccountFullName(user.full_name);
    }
  }, [user]);

  // UI display options
  const [compactMode, setCompactMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    // Load initial system settings from DB
    db.systemSettings.getAll().then(settings => {
      settings.forEach(s => {
        if (s.setting_key === 'shift_morning_start') setShiftMorningStart(s.setting_value);
        if (s.setting_key === 'shift_morning_end') setShiftMorningEnd(s.setting_value);
        if (s.setting_key === 'shift_afternoon_start') setShiftAfternoonStart(s.setting_value);
        if (s.setting_key === 'shift_afternoon_end') setShiftAfternoonEnd(s.setting_value);
        if (s.setting_key === 'shift_night_start') setShiftNightStart(s.setting_value);
        if (s.setting_key === 'shift_night_end') setShiftNightEnd(s.setting_value);

        if (s.setting_key === 'cargo_warning_timeout') setCargoWarningTimeout(s.setting_value);
        if (s.setting_key === 'lift_speed_per_floor') setLiftSpeedPerFloor(s.setting_value);
        if (s.setting_key === 'max_lift_load') setMaxLiftLoad(s.setting_value);
        if (s.setting_key === 'maintenance_interval') setMaintenanceInterval(s.setting_value);
        if (s.setting_key === 'auto_return_floor') setAutoReturnFloor(s.setting_value);
        if (s.setting_key === 'auto_lock_overload') setAutoLockOverload(s.setting_value === 'true');
      });
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (activeTab === 'account') {
        if (!user) {
          toast.error('Không tìm thấy thông tin người dùng!');
          setIsSaving(false);
          return;
        }

        const updates: any = { full_name: accountFullName };

        if (newPassword || confirmPassword) {
          if (newPassword !== confirmPassword) {
            toast.error('Mật khẩu mới và xác nhận mật khẩu không khớp!.');
            setIsSaving(false);
            return;
          }
          updates.password = newPassword;
        }

        await db.users.update(user.id, updates);
        useAuthStore.getState().setAuth({
          ...user,
          full_name: accountFullName,
        });

        await db.activityLogs.add({
          user_id: user.id,
          action: 'UPDATE_ACCOUNT',
          table_name: 'users',
          record_id: user.id,
          description: updates.password ? `Đã đổi mật khẩu thành công và cập nhật hồ sơ cá nhân cho nhân viên ${accountFullName}` : `Đã cập nhật hồ sơ cá nhân cho nhân viên ${accountFullName}`,
          event_type: 'USER_EVENT'
        }).catch(console.error);

        if (updates.password) {
          toast.success('Đổi mật khẩu thành công!');
          setNewPassword('');
          setConfirmPassword('');
        } else {
          toast.success('Cập nhật thông tin tài khoản thành công!');
        }
        setIsSaving(false);
        return;
      }

      await Promise.all([
        db.systemSettings.updateSetting('shift_morning_start', shiftMorningStart),
        db.systemSettings.updateSetting('shift_morning_end', shiftMorningEnd),
        db.systemSettings.updateSetting('shift_afternoon_start', shiftAfternoonStart),
        db.systemSettings.updateSetting('shift_afternoon_end', shiftAfternoonEnd),
        db.systemSettings.updateSetting('shift_night_start', shiftNightStart),
        db.systemSettings.updateSetting('shift_night_end', shiftNightEnd),

        db.systemSettings.updateSetting('cargo_warning_timeout', cargoWarningTimeout),
        db.systemSettings.updateSetting('lift_speed_per_floor', liftSpeedPerFloor),
        db.systemSettings.updateSetting('max_lift_load', maxLiftLoad),
        db.systemSettings.updateSetting('maintenance_interval', maintenanceInterval),
        db.systemSettings.updateSetting('auto_return_floor', autoReturnFloor),
        db.systemSettings.updateSetting('auto_lock_overload', String(autoLockOverload)),
      ]);

      await db.activityLogs.add({
        user_id: user?.id || 'u1',
        action: 'UPDATE_SETTINGS',
        table_name: 'system_settings',
        record_id: 'global',
        description: `Đã cập nhật tham số tời & vận hành vào Database: Cảnh báo (${cargoWarningTimeout}p), Tốc độ (${liftSpeedPerFloor}s/tầng), Tải trọng (${maxLiftLoad}kg), Chu kỳ bảo trì (${maintenanceInterval} ngày)`,
        event_type: 'SYSTEM_EVENT'
      }).catch(console.error);

      toast.success('Đã lưu tham số tời & vận hành vào Database thành công!');
    } catch (e) {
      toast.error('Lỗi khi lưu cài đặt vào Database');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950">
      <div className="flex-none p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-slate-900 dark:text-white">Cài Đặt Hệ Thống</h1>
            <p className="text-xs font-medium text-slate-500">Cấu hình tham số và tùy chọn người dùng</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
        {/* Settings Sidebar */}
        <div className="w-full md:w-64 flex-none border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-4 overflow-y-auto">
          <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible">
            <button
              onClick={() => setActiveTab('general')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'general'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
              <Monitor className="w-5 h-5" />
              Giao diện & Hiển thị
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'notifications'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
              <Bell className="w-5 h-5" />
              Thông báo & Âm thanh
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'system'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
              <Shield className="w-5 h-5" />
              Tham số Tời & Vận hành
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'database'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
              <Database className="w-5 h-5 text-emerald-600" />
              Cơ sở dữ liệu Google Sheet
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'account'
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
            >
              <User className="w-5 h-5" />
              Tài khoản cá nhân
            </button>
          </nav>
        </div>

        {/* Settings Content */}
        <div className="flex-1 p-4 md:p-8 overflow-y-auto">
          <div className="max-w-3xl mx-auto space-y-8">

            {activeTab === 'general' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Giao diện</h2>
                  <p className="text-sm text-slate-500">Tùy chỉnh màu sắc và hiển thị của ứng dụng.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setTheme('light')}
                    className={`flex flex-col items-center gap-3 p-4 border-2 rounded-2xl transition-all ${theme === 'light'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    <Sun className="w-8 h-8" />
                    <span className="font-semibold text-sm">Giao diện Sáng</span>
                  </button>
                  <button
                    onClick={() => setTheme('dark')}
                    className={`flex flex-col items-center gap-3 p-4 border-2 rounded-2xl transition-all ${theme === 'dark'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                  >
                    <Moon className="w-8 h-8" />
                    <span className="font-semibold text-sm">Giao diện Tối</span>
                  </button>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-6">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4">Tùy chọn hiển thị</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">Chế độ xem gọn (Compact Mode)</p>
                        <p className="text-xs text-slate-500 mt-1">Giảm kích thước các thẻ tời để hiển thị nhiều thông tin hơn</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">Tự động cập nhật (Auto-refresh)</p>
                        <p className="text-xs text-slate-500 mt-1">Cập nhật trạng thái tời theo thời gian thực liên tục</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" defaultChecked className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Thông báo & Âm thanh</h2>
                  <p className="text-sm text-slate-500">Cấu hình các kênh nhận cảnh báo và âm thanh hệ thống.</p>
                </div>

                <div className="space-y-4">
                  <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <Volume2 className="w-5 h-5 text-blue-500" />
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">Cảnh báo Âm thanh</h3>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 dark:text-slate-300">Tời đến tầng</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 dark:text-slate-300">Cảnh báo quá tải / Khẩn cấp</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-700 dark:text-slate-300">Nhắc nhở chưa lấy hàng (&gt; 2 phút)</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" defaultChecked className="sr-only peer" />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <Bot className="w-5 h-5 text-blue-500" />
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">Tích hợp Telegram</h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Bot Token (BotFather)</label>
                        <input type="password" defaultValue="1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Chat ID (Nhóm nhận thông báo)</label>
                        <input type="text" defaultValue="-1001234567890" className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="pt-2">
                        <button className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                          Gửi tin nhắn Test
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tham số Tời & Vận hành</h2>
                    <p className="text-sm text-slate-500">Cấu hình chi tiết các tham số kỹ thuật, luồng vận hành tời và lưu trữ vào Database.</p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Đồng bộ Database
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Shifts Card */}
                  <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" /> Ca Làm Việc Kho
                    </h3>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Ca Sáng (Bắt đầu - Kết thúc)</label>
                      <div className="flex gap-2">
                        <input type="time" value={shiftMorningStart} onChange={e => setShiftMorningStart(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="time" value={shiftMorningEnd} onChange={e => setShiftMorningEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Ca Chiều (Bắt đầu - Kết thúc)</label>
                      <div className="flex gap-2">
                        <input type="time" value={shiftAfternoonStart} onChange={e => setShiftAfternoonStart(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="time" value={shiftAfternoonEnd} onChange={e => setShiftAfternoonEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Ca Đêm (Bắt đầu - Kết thúc)</label>
                      <div className="flex gap-2">
                        <input type="time" value={shiftNightStart} onChange={e => setShiftNightStart(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="time" value={shiftNightEnd} onChange={e => setShiftNightEnd(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  </div>

                  {/* Lift Operational Rules */}
                  <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500" /> Cảnh Báo & Thời Gian
                    </h3>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Cảnh báo hàng ngâm chưa dỡ (Phút)</label>
                      <div className="relative">
                        <input type="number" min="1" max="60" value={cargoWarningTimeout} onChange={e => setCargoWarningTimeout(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">phút</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Bắn thông báo Telegram khi hàng ở tầng nhận chưa dỡ quá hạn.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Tốc độ tời mô phỏng (Giây/tầng)</label>
                      <div className="relative">
                        <input type="number" min="1" max="60" value={liftSpeedPerFloor} onChange={e => setLiftSpeedPerFloor(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">giây / tầng</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Chu kỳ kiểm tra bảo trì (Ngày)</label>
                      <div className="relative">
                        <input type="number" min="7" max="365" value={maintenanceInterval} onChange={e => setMaintenanceInterval(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">ngày</span>
                      </div>
                    </div>
                  </div>

                  {/* Load & Safety Settings */}
                  <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs md:col-span-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                      <Bot className="w-4 h-4 text-purple-500" /> Tải Trọng & Quy Tắc An Toàn Tời
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Tải trọng tối đa cho phép (kg)</label>
                        <div className="relative">
                          <input type="number" step="50" min="100" max="5000" value={maxLiftLoad} onChange={e => setMaxLiftLoad(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-medium">kg</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Tầng tự động trả về khi tời rảnh</label>
                        <select value={autoReturnFloor} onChange={e => setAutoReturnFloor(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="1">Tầng 1 (Kho chính)</option>
                          <option value="0">Tầng trệt (Tầng 0)</option>
                          <option value="none">Không tự động trả (Giữ nguyên vị trí)</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white text-sm">Tự động khóa tời khi khẩn cấp / quá tải</p>
                        <p className="text-xs text-slate-500 mt-0.5">Kích hoạt chuyển trạng thái ĐÃ KHÓA (LOCKED) khi phát hiện sự cố an toàn.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={autoLockOverload} onChange={e => setAutoLockOverload(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                      >
                        {isSaving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Đang lưu Database...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4" />
                            LƯU THAM SỐ TỜI VÀO DATABASE
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'database' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Database className="w-5 h-5 text-emerald-600" />
                      Cơ sở dữ liệu Google Sheet
                    </h2>
                    <p className="text-sm text-slate-500">
                      Hệ thống đang hoạt động và đồng bộ trực tiếp 100% với Google Spreadsheet của bạn.
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Đang hoạt động (Connected)
                  </span>
                </div>

                <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Cấu hình Endpoint Web App
                  </h3>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Google Apps Script Web App URL</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={GOOGLE_SHEET_API_URL}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-300"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Endpoint nhận và xử lý lệnh đọc/ghi hai chiều từ Google Sheet của bạn.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      onClick={async () => {
                        setIsSyncingSheet(true);
                        try {
                          const success = await syncGoogleSheetData();
                          if (success) {
                            toast.success('Đã đồng bộ toàn bộ dữ liệu từ Google Sheet thành công!');
                          } else {
                            toast.error('Lỗi khi đồng bộ từ Google Sheet.');
                          }
                        } catch (e) {
                          toast.error('Không thể kết nối đến Google Sheet.');
                        } finally {
                          setIsSyncingSheet(false);
                        }
                      }}
                      disabled={isSyncingSheet}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncingSheet ? 'animate-spin' : ''}`} />
                      {isSyncingSheet ? 'Đang đồng bộ...' : 'ĐỒNG BỘ VỚI GOOGLE SHEET NGAY'}
                    </button>
                  </div>
                </div>

                <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">Các trang tính (Tabs) đang liên kết</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">📄 Users:</span>
                      <p className="text-slate-500 mt-0.5">Lưu danh sách tài khoản, mật khẩu, vai trò nhân viên</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">🛗 Lifts:</span>
                      <p className="text-slate-500 mt-0.5">Lưu trạng thái 5 thang tời (L1 - L5), tầng hiện tại, giới hạn tầng</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">📦 TransportJobs:</span>
                      <p className="text-slate-500 mt-0.5">Lưu các đơn hàng chuyển hàng giữa các tầng</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">📅 DailyAssignments:</span>
                      <p className="text-slate-500 mt-0.5">Lưu phân công nhân viên theo ca trực và tầng kho</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">🔔 Notifications:</span>
                      <p className="text-slate-500 mt-0.5">Lưu lịch sử thông báo và chuông báo đến tầng</p>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <span className="font-bold text-slate-900 dark:text-white">📜 ActivityLogs:</span>
                      <p className="text-slate-500 mt-0.5">Lưu lịch sử hoạt động và điều phối tời</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'account' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tài khoản cá nhân</h2>
                  <p className="text-sm text-slate-500">Quản lý thông tin đăng nhập và hồ sơ cá nhân.</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center border-2 border-blue-200 dark:border-blue-800">
                      <User className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white">{user?.full_name || 'Tài khoản chưa cập nhật'}</h3>
                      <p className="text-sm font-medium text-slate-500">{user?.role || 'User'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Mã nhân viên / Tên đăng nhập</label>
                      <input type="text" disabled defaultValue={user?.employee_code || user?.email?.split('@')[0] || ''} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-500 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Họ và tên</label>
                      <input
                        type="text"
                        value={accountFullName}
                        onChange={e => setAccountFullName(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-4">Đổi mật khẩu</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Mật khẩu mới</label>
                        <input type="password" placeholder="Bỏ trống nếu không đổi" className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Xác nhận mật khẩu mới</label>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Bỏ trống nếu không đổi"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-6">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm shadow-blue-500/20 disabled:opacity-50 transition-all"
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Lưu thay đổi
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
