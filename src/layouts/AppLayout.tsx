import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";
import { useAudioBroadcast } from "../hooks/useAudioBroadcast";

export function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Kích hoạt lắng nghe phát thanh Text to Speech cho các tài khoản phân công ở tầng tương ứng
  useAudioBroadcast();

  return (
    <div className="flex h-[100dvh] bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div className="flex-1 flex flex-col lg:ml-60 overflow-hidden w-full transition-all">
        <TopNav onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 min-w-0 flex flex-col">
          <div className="w-full mx-auto flex-1 flex flex-col min-h-0">
            <Outlet />
          </div>
        </main>
        {/* Footer Control Bar */}
        <div className="h-12 bg-slate-900 text-white px-4 sm:px-6 flex items-center justify-between shrink-0 overflow-x-auto gap-4">
          <div className="flex items-center gap-4 sm:gap-6 whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:inline">Giọng nói:</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest sm:hidden">Mic:</span>
              <span className="text-[10px] font-bold text-blue-400 uppercase">Sẵn sàng</span>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex -space-x-2">
              <div className="w-6 h-6 rounded-full bg-slate-700 border-2 border-slate-900"></div>
              <div className="w-6 h-6 rounded-full bg-slate-600 border-2 border-slate-900"></div>
              <div className="w-6 h-6 rounded-full bg-slate-500 border-2 border-slate-900 flex items-center justify-center text-[8px] font-bold">+3</div>
            </div>
            <span className="text-[10px] text-slate-400 hidden sm:inline">5 NV Đang Trực</span>
          </div>
        </div>
      </div>
    </div>
  );
}

