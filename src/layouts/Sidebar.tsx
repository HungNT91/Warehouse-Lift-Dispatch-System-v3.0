import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { 
  ArrowUpDown, 
  User as UserIcon, 
  LogOut,
  X
} from "lucide-react";
import { useAuthStore } from "../stores/useAuthStore";
import { getSupabase } from "../api/supabase";
import { isSupabaseConfigured } from "../api/dbClient";
import { getNavItemsForRole } from "../config/navigation";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const navItems = getNavItemsForRole(user?.role);

  const handleLogout = async () => {
    try {
      logout();
      if (isSupabaseConfigured()) {
        const supabase = getSupabase();
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside className={cn(
        "w-60 bg-slate-950 border-r border-slate-800 h-[100dvh] flex flex-col fixed left-0 top-0 shrink-0 z-50 transition-transform duration-300 lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg shadow-blue-500/20">
              <ArrowUpDown className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white">W.L.D.S</span>
              <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Hệ Thống Quản Lý Thang Tời Kho</span>
            </div>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 flex flex-col gap-1 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => onClose()}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200",
                  isActive 
                    ? "bg-blue-600/20 text-blue-400 font-semibold" 
                    : "text-slate-400 hover:bg-slate-900 font-medium hover:text-slate-200"
                )}
              >
                <item.icon className={cn("w-[18px] h-[18px]", isActive ? "text-blue-400" : "text-slate-400")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 flex flex-col gap-1">
          <div className="flex items-center justify-between p-2 bg-slate-900 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                 <UserIcon className="w-4 h-4 text-slate-300" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-white truncate">{user?.full_name || 'Tài khoản'}</p>
                <p className="text-[10px] text-slate-400 truncate">{user?.role || 'User'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 transition-colors p-1"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
