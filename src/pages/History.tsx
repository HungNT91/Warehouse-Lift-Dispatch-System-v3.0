import React, { useState } from 'react';
import { 
  History, Search, Filter, Download, Calendar, ArrowUpDown, 
  Package, AlertTriangle, ShieldCheck, CheckCircle2,
  Clock, FileText, ChevronRight, RefreshCw, UserCheck
} from 'lucide-react';
import { useLiftStore } from '../stores/useLiftStore';
import { ActivityLog } from '../types';
import { toast } from 'sonner';

export const HistoryPage: React.FC = () => {
  const { activities, jobs } = useLiftStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedTimeRange, setSelectedTimeRange] = useState<string>('TODAY');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  // Filter activities
  const filteredActivities = activities.filter((act) => {
    const matchesSearch = 
      act.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.user_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (act.entity_id && act.entity_id.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = selectedCategory === 'ALL' || act.action === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  // Handle Export CSV
  const handleExportCSV = () => {
    try {
      const headers = ['ID', 'Thời gian', 'Hành động', 'Thực thể', 'Mã thực thể', 'Chi tiết nhật ký'];
      const rows = filteredActivities.map(a => [
        a.id,
        a.created_at,
        a.action,
        a.entity,
        a.entity_id || '',
        `"${a.description.replace(/"/g, '""')}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `lich_su_van_hanh_toi_${new Date().toISOString().slice(0,10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Đã xuất file lịch sử vận hành CSV thành công!');
    } catch (e) {
      toast.error('Có lỗi xảy ra khi xuất file CSV.');
    }
  };

  const getCategoryBadge = (action: string) => {
    switch (action) {
      case 'job':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
            <Package className="w-3 h-3" />
            Đơn Hàng
          </span>
        );
      case 'system':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" />
            Thang Tời
          </span>
        );
      case 'alert':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Cảnh Báo
          </span>
        );
      case 'assignment':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1">
            <UserCheck className="w-3 h-3" />
            Phân Công
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
            Hệ Thống
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-500/20">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              Lịch Sử Vận Hành System
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Nhật ký chi tiết các lượt tời, tạo đơn, xác nhận nhận hàng và phân công
            </p>
          </div>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-sm rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Xuất Báo Cáo CSV</span>
        </button>
      </div>

      {/* Summary KPI stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Tổng Nhật Ký</p>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{activities.length}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              Ghi nhận
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Hoàn Thành Trong Ngày</p>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
              {jobs.filter(j => j.status === 'COMPLETED').length}
            </span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              Đơn xong
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Thời Gian Vận Hành TB</p>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">2 phút 15s</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
              Mỗi lượt
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Độ Tin Cậy Tời</p>
          <div className="flex items-end justify-between mt-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">99.4%</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
              Chỉ số ổn định
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm nội dung nhật ký, mã tời, mã đơn..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
            >
              <option value="TODAY">Hôm nay</option>
              <option value="7DAYS">7 ngày gần đây</option>
              <option value="30DAYS">30 ngày gần đây</option>
            </select>
          </div>
        </div>

        {/* Filter categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-400">
          {[
            { key: 'ALL', label: 'Tất cả sự kiện' },
            { key: 'job', label: 'Đơn hàng' },
            { key: 'system', label: 'Thang tời' },
            { key: 'alert', label: 'Cảnh báo' },
            { key: 'assignment', label: 'Phân công ca' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredActivities.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Không có nhật ký phù hợp</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Thử thay đổi bộ lọc tìm kiếm</p>
            </div>
          ) : (
            filteredActivities.map((act) => (
              <div
                key={act.id}
                onClick={() => setSelectedLog(act)}
                className="p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex items-center justify-between gap-4 cursor-pointer"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-xs font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
                    {act.created_at}
                  </div>

                  <div className="shrink-0">
                    {getCategoryBadge(act.action)}
                  </div>

                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {act.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {act.entity_id && (!act.entity_id.includes('-') || act.entity_id.length < 20) && (
                    <span className="hidden sm:inline px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">
                      #{act.entity_id.replace(/^#/, '')}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
