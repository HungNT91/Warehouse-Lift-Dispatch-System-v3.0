import React, { useState } from 'react';
import {
  Bell, Volume2, CheckCheck, Trash2, AlertTriangle, Info, CheckCircle2,
  MessageCircle, Settings2, Sparkles, Filter, ChevronRight, ArrowUpDown, Clock
} from 'lucide-react';
import { useLiftStore } from '../stores/useLiftStore';
import { playElevatorChime, speakText } from '../utils/audio';
import { AppNotification } from '../types';
import { toast } from 'sonner';

export const NotificationsPage: React.FC = () => {
  const { notifications, markNotificationRead, markAllNotificationsRead, clearNotifications } = useLiftStore();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [telegramSyncEnabled, setTelegramSyncEnabled] = useState<boolean>(true);
  const [uncollectedAlertEnabled, setUncollectedAlertEnabled] = useState<boolean>(true);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const filteredNotifications = notifications.filter(n => {
    if (selectedCategory === 'UNREAD') return !n.is_read;
    if (selectedCategory === 'ALL') return true;
    return n.category === selectedCategory;
  });

  const handleTestChime = () => {
    playElevatorChime();
    toast.success('🔔 Đã phát thử âm thanh chuông thang máy!');
  };

  const handleTestTTS = () => {
    speakText('Thông báo! Thang P1 đã vận chuyển hàng đến Tầng 3. Mời nhân viên kiểm tra kéo hàng!');
    toast.success('📢 Đã kích hoạt giọng nói TTS (Tiếng Việt)! Nếu không nghe thấy, vui lòng mở ứng dụng trong Tab mới (bấm nút "Open in new tab" ở góc trên bên phải) do chính sách bảo mật iframe của trình duyệt.');
  };
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'warning':
        return (
          <div className="p-2.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5 animate-pulse" />
          </div>
        );
      case 'error':
        return (
          <div className="p-2.5 bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-xl shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
        );
      case 'success':
        return (
          <div className="p-2.5 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        );
      default:
        return (
          <div className="p-2.5 bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Info className="w-5 h-5" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-md shadow-amber-500/20">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                Trung Tâm Thông Báo & Cảnh Báo
              </h1>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs font-black">
                  {unreadCount} chưa đọc
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Quản lý chuông báo tời đến tầng, cảnh báo hàng tồn đọng và nhật ký gửi Telegram
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleTestChime}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            <span>Thử Chuông Tời</span>
          </button>

          <button
            onClick={handleTestTTS}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span>Thử Giọng Nói (TTS)</span>
          </button>

          <button
            onClick={() => {
              markAllNotificationsRead();
              toast.success('Đã đánh dấu đọc tất cả thông báo!');
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            <CheckCheck className="w-4 h-4 text-emerald-500" />
            <span>Đọc Tất Cả</span>
          </button>

          <button
            onClick={() => {
              clearNotifications();
              toast.info('Đã xóa tất cả lịch sử thông báo!');
            }}
            className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-xl transition-colors cursor-pointer"
            title="Xóa danh sách"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <Settings2 className="w-4 h-4 text-slate-500" />
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Cấu Hình Chuông Báo & Cảnh Báo
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60 cursor-pointer">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Chuông khi tời đến tầng</span>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(e) => {
                setSoundEnabled(e.target.checked);
                toast.info(e.target.checked ? 'Đã BẬT chuông tời' : 'Đã TẮT chuông tời');
              }}
              className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60 cursor-pointer">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-sky-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Đồng bộ nhóm Telegram</span>
            </div>
            <input
              type="checkbox"
              checked={telegramSyncEnabled}
              onChange={(e) => {
                setTelegramSyncEnabled(e.target.checked);
                toast.info(e.target.checked ? 'Đã BẬT đồng bộ Telegram' : 'Đã TẮT đồng bộ Telegram');
              }}
              className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
            />
          </label>

          <label className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/60 dark:border-slate-700/60 cursor-pointer">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Cảnh báo tồn hàng &gt;2 phút</span>
            </div>
            <input
              type="checkbox"
              checked={uncollectedAlertEnabled}
              onChange={(e) => {
                setUncollectedAlertEnabled(e.target.checked);
                toast.info(e.target.checked ? 'Đã BẬT cảnh báo tồn hàng' : 'Đã TẮT cảnh báo tồn hàng');
              }}
              className="w-4 h-4 accent-red-500 rounded cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800">
        {[
          { key: 'ALL', label: 'Tất cả' },
          { key: 'UNREAD', label: `Chưa đọc (${unreadCount})` },
          { key: 'uncollected', label: 'Tồn đọng hàng' },
          { key: 'lift', label: 'Tời vận hành' },
          { key: 'job', label: 'Đơn hàng' },
          { key: 'system', label: 'Hệ thống' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedCategory(tab.key)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors cursor-pointer ${selectedCategory === tab.key
              ? 'bg-amber-500 text-white shadow-xs'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
            <Bell className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-base font-bold text-slate-700 dark:text-slate-300">Không có thông báo nào</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Danh sách thông báo hiện tại đang trống</p>
          </div>
        ) : (
          filteredNotifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => markNotificationRead(notif.id)}
              className={`p-4 md:p-5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${!notif.is_read
                ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60 shadow-xs'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                }`}
            >
              <div className="flex items-start gap-3.5">
                {getSeverityIcon(notif.severity)}

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {notif.title}
                    </h4>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                    {notif.message}
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 pt-1">
                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {!notif.is_read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markNotificationRead(notif.id);
                  }}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-amber-600 transition-colors shrink-0"
                >
                  Đánh dấu đã đọc
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
