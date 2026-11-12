import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart,
  Legend
} from 'recharts';
import {
  Calendar,
  Download,
  RefreshCw,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Search,
  Filter,
  Package,
  Layers,
  ChevronLeft,
  ChevronRight,
  Printer
} from 'lucide-react';
import { useLiftStore } from '../stores/useLiftStore';
import {
  TimeRange,
  filterJobs,
  calculateReportKPIs,
  buildHourlyChartData,
  buildFloorChartData,
  buildLiftWorkloadData,
  exportReportToCSV
} from '../utils/reportAnalytics';
import { toast } from 'sonner';

export function Reports() {
  const { jobs, lifts, fetchDynamicData, isLoading, lastSyncedAt } = useLiftStore();

  // State bộ lọc
  const [timeRange, setTimeRange] = useState<TimeRange>('TODAY');
  const [selectedFloor, setSelectedFloor] = useState<number | 'ALL'>('ALL');
  const [selectedLift, setSelectedLift] = useState<string | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // 1. Lọc danh sách công việc thực tế
  const filteredJobs = useMemo(() => {
    return filterJobs(jobs, timeRange, selectedFloor, selectedLift, selectedStatus);
  }, [jobs, timeRange, selectedFloor, selectedLift, selectedStatus]);

  // 2. Tính toán các chỉ số KPI
  const kpis = useMemo(() => {
    return calculateReportKPIs(filteredJobs, lifts);
  }, [filteredJobs, lifts]);

  // 3. Xây dựng dữ liệu cho các biểu đồ
  const hourlyData = useMemo(() => {
    return buildHourlyChartData(filteredJobs, timeRange);
  }, [filteredJobs, timeRange]);

  const floorData = useMemo(() => {
    return buildFloorChartData(filteredJobs);
  }, [filteredJobs]);

  const liftWorkloadData = useMemo(() => {
    return buildLiftWorkloadData(filteredJobs, lifts);
  }, [filteredJobs, lifts]);

  // 4. Lọc bảng chi tiết theo từ khóa tìm kiếm
  const tableJobs = useMemo(() => {
    if (!searchQuery.trim()) return filteredJobs;
    const q = searchQuery.toLowerCase();
    return filteredJobs.filter(
      (j) =>
        (j.code && j.code.toLowerCase().includes(q)) ||
        (j.item_type && j.item_type.toLowerCase().includes(q)) ||
        (j.creator_name && j.creator_name.toLowerCase().includes(q)) ||
        (j.lift_number && j.lift_number.toLowerCase().includes(q)) ||
        (j.notes && j.notes.toLowerCase().includes(q))
    );
  }, [filteredJobs, searchQuery]);

  // Phân trang cho bảng
  const totalPages = Math.max(1, Math.ceil(tableJobs.length / itemsPerPage));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return tableJobs.slice(start, start + itemsPerPage);
  }, [tableJobs, currentPage, itemsPerPage]);

  // Xử lý làm mới dữ liệu
  const handleRefresh = async () => {
    try {
      await fetchDynamicData();
      toast.success('Đã cập nhật dữ liệu báo cáo mới nhất từ hệ thống kho!');
    } catch {
      toast.error('Không thể làm mới dữ liệu. Vui lòng thử lại sau.');
    }
  };

  // Xử lý xuất CSV
  const handleExportCSV = () => {
    try {
      const timeLabels: Record<TimeRange, string> = {
        TODAY: 'HomNay',
        WEEK: '7NgayQua',
        MONTH: '30NgayQua',
        ALL: 'ToanBo'
      };
      exportReportToCSV(filteredJobs, timeLabels[timeRange]);
      toast.success(`Đã xuất thành công ${filteredJobs.length} đơn vận chuyển ra file CSV!`);
    } catch (e) {
      console.error(e);
      toast.error('Có lỗi xảy ra trong quá trình tạo file CSV.');
    }
  };

  // Xử lý In báo cáo
  const handlePrint = () => {
    window.print();
  };

  // Nhãn trạng thái hiển thị
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành
          </span>
        );
      case 'MOVING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <ArrowUpDown className="w-3.5 h-3.5 animate-pulse" /> Đang chuyển
          </span>
        );
      case 'WAITING_PICKUP':
      case 'PICKED_UP':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3.5 h-3.5" /> Chờ dỡ hàng
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Đã hủy
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-16">
      {/* 1. Header & Action Bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-2xl md:text-3xl text-slate-900 dark:text-white">
              Báo Cáo Hiệu Suất Kho Vận
            </h1>
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Dữ liệu trực tiếp
            </span>
          </div>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm md:text-base mt-1">
            Tổng hợp phân tích vận hành tời, tiến độ lưu chuyển hàng hóa và thời gian đáp ứng
            {lastSyncedAt && (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                • Cập nhật: {new Date(lastSyncedAt).toLocaleTimeString('vi-VN')}
              </span>
            )}
          </p>
        </div>

        {/* Nút tác vụ */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto print:hidden">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm text-sm"
            title="Làm mới dữ liệu từ hệ thống"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Làm Mới</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm text-sm"
            title="In hoặc lưu dạng PDF"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">In Báo Cáo</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm shadow-blue-200 dark:shadow-blue-900/20 text-sm whitespace-nowrap active:scale-95"
          >
            <Download className="w-4 h-4" /> Xuất File CSV
          </button>
        </div>
      </div>

      {/* 2. Bộ Lọc Điều Khiển (Filter Toolbar) */}
      <div className="bg-white dark:bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 print:hidden">
        {/* Nút chọn khung thời gian */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
          {(
            [
              { id: 'TODAY', label: 'Hôm Nay' },
              { id: 'WEEK', label: '7 Ngày Qua' },
              { id: 'MONTH', label: '30 Ngày Qua' },
              { id: 'ALL', label: 'Toàn Bộ' }
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setTimeRange(item.id);
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${timeRange === item.id
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Các Dropdown lọc bổ sung */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Lọc theo Tầng */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs md:text-sm font-medium">
            <Layers className="w-4 h-4 text-slate-500" />
            <select
              value={selectedFloor}
              onChange={(e) => {
                setSelectedFloor(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-700 dark:text-slate-300 outline-none cursor-pointer pr-1"
            >
              <option value="ALL">Tất cả tầng</option>
              <option value="1">Tầng 1 (Kho xuất nhập)</option>
              <option value="2">Tầng 2 (Linh kiện A)</option>
              <option value="3">Tầng 3 (Thành phẩm B)</option>
              <option value="4">Tầng 4 (Xưởng gia công)</option>
            </select>
          </div>

          {/* Lọc theo Tời */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs md:text-sm font-medium">
            <ArrowUpDown className="w-4 h-4 text-slate-500" />
            <select
              value={selectedLift}
              onChange={(e) => {
                setSelectedLift(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-700 dark:text-slate-300 outline-none cursor-pointer pr-1"
            >
              <option value="ALL">Tất cả thang</option>
              {lifts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lift_number || l.id}
                </option>
              ))}
            </select>
          </div>

          {/* Lọc theo Trạng thái */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs md:text-sm font-medium">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-700 dark:text-slate-300 outline-none cursor-pointer pr-1"
            >
              <option value="ALL">Mọi trạng thái</option>
              <option value="COMPLETED">Đã hoàn thành</option>
              <option value="MOVING">Đang vận chuyển</option>
              <option value="WAITING_PICKUP">Chờ dỡ hàng</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Hàng Thẻ KPI Thống Kê Chính (Executive Metric Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        {/* KPI 1: Tổng số đơn */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Tổng Việc Vận Chuyển
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {kpis.totalJobs}
            </span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              {kpis.completedJobs} hoàn thành
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${kpis.completionRate}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Tỷ lệ hoàn thành */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Tỷ Lệ Hoàn Thành
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {kpis.completionRate}%
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-md ${kpis.completionRate >= 90
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                }`}
            >
              {kpis.completionRate >= 90 ? 'Tối ưu' : 'Bình thường'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {kpis.cancelledJobs > 0 ? `${kpis.cancelledJobs} đơn đã hủy` : 'Không có đơn bị gián đoạn'}
          </p>
        </div>

        {/* KPI 3: Thời gian chờ trung bình */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Thời Gian Chờ Trung Bình
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {kpis.avgWaitTimeMinutes}
            </span>
            <span className="text-sm font-semibold text-slate-500">phút / lượt</span>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Ngưỡng báo động Telegram: <span className="font-semibold text-amber-600">2 phút</span>
          </p>
        </div>

        {/* KPI 4: Tời hiệu quả nhất */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider">
              Thang Hoạt Động Nhiều Nhất
            </span>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ArrowUpDown className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {kpis.topLiftName}
            </span>
            {kpis.topLiftJobsCount > 0 && (
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                ({kpis.topLiftJobsCount} chuyến)
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {kpis.delayedCount > 0
              ? `Toàn kho có ${kpis.delayedCount} đơn cảnh báo kéo hàng chậm`
              : 'Tiến độ dỡ tải các tầng thông suốt'}
          </p>
        </div>
      </div>

      {/* 4. Khu Vực Biểu Đồ Trực Quan (4 Charts) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8">
        {/* Biểu đồ 1: Khối lượng vận chuyển theo giờ / ngày */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Khối Lượng Vận Chuyển Theo Thời Gian
              </h3>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                {timeRange === 'TODAY'
                  ? 'Số lượng đơn phát sinh trong các khung giờ làm việc hôm nay'
                  : 'Số lượng đơn được ghi nhận theo từng ngày trong kỳ báo cáo'}
              </p>
            </div>
          </div>
          <div className="flex-1 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#fff'
                  }}
                  itemStyle={{ fontWeight: 600 }}
                  labelStyle={{ color: '#64748B', marginBottom: 4 }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area
                  type="monotone"
                  dataKey="jobs"
                  name="Tổng Việc"
                  stroke="#2563EB"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorJobs)"
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Hoàn Thành"
                  stroke="#10B981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCompleted)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ 2: Phân bổ hoạt động theo tầng */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-emerald-600" />
                Phân Bổ Hoạt Động Theo Tầng
              </h3>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                Lưu lượng hàng hóa hoàn thành so với các đơn chậm trễ/tồn đọng
              </p>
            </div>
          </div>
          <div className="flex-1 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={floorData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#fff'
                  }}
                  cursor={{ fill: '#F8FAFC' }}
                  labelStyle={{ color: '#64748B', marginBottom: 4 }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar
                  dataKey="active"
                  name="Đã Hoàn Thành"
                  fill="#10B981"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
                <Bar
                  dataKey="delayed"
                  name="Chậm Trễ / Tồn Đọng"
                  fill="#EF4444"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ 3: Năng suất từng thang tời */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowUpDown className="w-5 h-5 text-indigo-600" />
                Tải Trọng & Số Chuyến Từng Tời
              </h3>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                So sánh số đơn điều phối giữa các tời kho trong hệ thống
              </p>
            </div>
          </div>
          <div className="flex-1 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={liftWorkloadData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  dy={10}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    backgroundColor: '#fff'
                  }}
                  cursor={{ fill: '#F8FAFC' }}
                  labelStyle={{ color: '#64748B', marginBottom: 4 }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Bar
                  dataKey="jobs"
                  name="Tổng Chuyến Chạy"
                  fill="#6366F1"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
                <Bar
                  dataKey="completed"
                  name="Hoàn Tất"
                  fill="#14B8A6"
                  radius={[4, 4, 0, 0]}
                  barSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Biểu đồ 4: Xu hướng thời gian chờ trung bình */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-col h-[400px]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display font-bold text-base md:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-500" />
                Biến Thiên Thời Gian Chờ (Phút)
              </h3>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">
                Theo dõi thời gian chờ dỡ tải trên tất cả các tầng theo chu kỳ
              </p>
            </div>
          </div>
          <div className="flex-1 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  unit="p"
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                  }}
                  itemStyle={{ fontWeight: 600, color: '#F59E0B' }}
                  labelStyle={{ color: '#64748B', marginBottom: 4 }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Line
                  type="monotone"
                  dataKey="waitTime"
                  name="Thời Gian Chờ Trung Bình (phút)"
                  stroke="#F59E0B"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Bảng Chi Tiết Lịch Sử Vận Chuyển Trong Kỳ Báo Cáo */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-col">
        {/* Header bảng & Ô tìm kiếm */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="font-display font-bold text-lg text-slate-900 dark:text-white">
              Chi Tiết Lượt Vận Chuyển ({tableJobs.length})
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
              Danh sách chi tiết từng đơn hàng tương ứng với bộ lọc đã chọn
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm mã đơn, tên hàng, nhân viên..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs md:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Nội dung bảng */}
        <div className="overflow-x-auto -mx-4 md:mx-0">
          <table className="w-full text-left text-sm border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase">
                <th className="py-3 px-4">Mã Đơn</th>
                <th className="py-3 px-4">Tời</th>
                <th className="py-3 px-4">Lộ Trình</th>
                <th className="py-3 px-4">Loại Hàng & SL</th>
                <th className="py-3 px-4">Người Khởi Tạo</th>
                <th className="py-3 px-4">Thời Gian</th>
                <th className="py-3 px-4 text-right">Trạng Thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Không tìm thấy công việc nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((job) => (
                  <tr
                    key={job.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      #{job.code || job.id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        {job.lift_number || job.lift_id}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                          T{job.source_floor || 1}
                        </span>
                        ➔
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                          T{job.target_floor || 1}
                        </span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-900 dark:text-white font-medium">
                        {job.item_type || 'Pallet Hàng'}
                      </div>
                      <div className="text-xs text-slate-400">Số lượng: {job.quantity || 1}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-xs">
                      {job.creator_name || 'Nhân viên kho'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {job.created_at
                        ? new Date(job.created_at).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                        : 'Vừa xong'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {getStatusBadge(job.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Phân trang */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-500">
              Trang {currentPage} trên {totalPages} (Tổng {tableJobs.length} đơn)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
