import { 
  LayoutDashboard, 
  ArrowUpDown, 
  Package, 
  History, 
  Bell, 
  BarChart3, 
  Users, 
  Settings,
  Layers
} from "lucide-react";
import { Role } from "../types";

export interface NavItem {
  label: string;
  href: string;
  icon: any;
  roles?: Role[];
}

export const ALL_NAV_ITEMS: NavItem[] = [
  { label: "Bảng Điều Khiển", href: "/", icon: LayoutDashboard },
  { label: "Phân Công Ca", href: "/assignment", icon: Layers },
  { label: "Giám Sát Tời", href: "/lifts", icon: ArrowUpDown, roles: ['Supervisor', 'Admin'] },
  { label: "Lịch Sử", href: "/history", icon: History },
  { label: "Thông Báo", href: "/notifications", icon: Bell },
  { label: "Báo Cáo", href: "/reports", icon: BarChart3, roles: ['Supervisor', 'Admin'] },
  { label: "Người Dùng", href: "/users", icon: Users, roles: ['Supervisor', 'Admin'] },
  { label: "Cài Đặt", href: "/settings", icon: Settings },
];


export function getNavItemsForRole(role?: Role): NavItem[] {
  if (!role) {
    return ALL_NAV_ITEMS.filter(item => !item.roles || item.roles.includes('Worker'));
  }

  // Supervisor and Admin see all items
  if (role === 'Supervisor' || role === 'Admin') {
    return ALL_NAV_ITEMS;
  }

  // Worker sees only non-admin items
  return ALL_NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role));
}
