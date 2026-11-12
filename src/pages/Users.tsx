import { useState, useEffect } from 'react';
import { User, Role } from '../types';
import { db } from '../api/dbClient';
import { toast } from 'sonner';
import { 
  Users as UsersIcon, 
  Search, 
  Plus, 
  MoreVertical, 
  Edit, 
  Trash2, 
  X, 
  Shield, 
  CheckCircle2, 
  Lock 
} from 'lucide-react';

const mockUsersFallback: (User & { status: 'active' | 'offline' })[] = [
  {
    id: 'NV001',
    email: 'NV001@liftflow.local',
    full_name: 'Nguyễn Văn Hùng',
    employee_code: 'NV001',
    phone: '0988123456',
    role: 'Admin',
    status: 'active',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
  },
  {
    id: 'NV002',
    email: 'NV002@liftflow.local',
    full_name: 'Trần Văn Hải',
    employee_code: 'NV002',
    phone: '0977234567',
    role: 'Supervisor',
    status: 'active',
    created_at: '2026-01-16T00:00:00Z',
    updated_at: '2026-01-16T00:00:00Z',
  },
  {
    id: 'NV003',
    email: 'NV003@liftflow.local',
    full_name: 'Phạm Lan Trang',
    employee_code: 'NV003',
    phone: '0966345678',
    role: 'Worker',
    status: 'offline',
    created_at: '2026-01-17T00:00:00Z',
    updated_at: '2026-01-17T00:00:00Z',
  }
];

export function Users() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [users, setUsers] = useState<(User & { status: 'active' | 'offline' })[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Form states
  const [formData, setFormData] = useState({
    employee_code: '',
    full_name: '',
    password: '',
    role: 'Worker' as Role,
    phone: ''
  });

  const loadUsersFromDb = async () => {
    setIsLoadingUsers(true);
    try {
      const [dbUsers, dbRoles] = await Promise.all([
        db.users.getAll(),
        db.roles.getAll()
      ]);

      const roleNameMap: Record<number, Role> = {};
      dbRoles.forEach(r => {
        const n = r.role_name.toLowerCase();
        if (n.includes('admin')) roleNameMap[r.id] = 'Admin';
        else if (n.includes('super')) roleNameMap[r.id] = 'Supervisor';
        else roleNameMap[r.id] = 'Worker';
      });

      const formatted: (User & { status: 'active' | 'offline' })[] = dbUsers.map(u => ({
        id: u.id,
        email: `${u.employee_code || u.id}@liftflow.local`,
        full_name: u.full_name,
        employee_code: u.employee_code || undefined,
        phone: u.phone || undefined,
        role: roleNameMap[u.role_id] || (u.role_id === 1 ? 'Admin' : u.role_id === 2 ? 'Supervisor' : 'Worker'),
        status: u.active ? 'active' : 'offline',
        created_at: u.created_at,
        updated_at: u.created_at,
      }));

      setUsers(formatted);
    } catch (e) {
      console.error('Error loading users from DB:', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsersFromDb();
  }, []);

  const handleOpenModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        employee_code: user.employee_code || '',
        full_name: user.full_name,
        password: '',
        role: user.role,
        phone: user.phone || ''
      });
    } else {
      setEditingUser(null);
      setFormData({
        employee_code: '',
        full_name: '',
        password: '',
        role: 'Worker',
        phone: ''
      });
    }
    setIsAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setEditingUser(null);
  };

  const handleSaveUser = async () => {
    if (!formData.full_name.trim()) {
      toast.error('Vui lòng nhập Họ và Tên nhân viên');
      return;
    }

    try {
      const dbRoles = await db.roles.getAll();
      const adminRole = dbRoles.find(r => r.role_name.toLowerCase().includes('admin'))?.id ?? 1;
      const superRole = dbRoles.find(r => r.role_name.toLowerCase().includes('super'))?.id ?? 2;
      const workerRole = dbRoles.find(r => r.role_name.toLowerCase().includes('work') || r.role_name.toLowerCase().includes('nhân viên'))?.id ?? 3;

      const roleIdMap: Record<Role, number> = {
        'Admin': adminRole,
        'Supervisor': superRole,
        'Worker': workerRole
      };
      const selectedRoleId = roleIdMap[formData.role] ?? workerRole;
      if (editingUser) {
        await db.users.update(editingUser.id, {
          full_name: formData.full_name,
          employee_code: formData.employee_code,
          role_id: selectedRoleId,
          phone: formData.phone,
          ...(formData.password ? { password: formData.password } : {})
        });

        await db.activityLogs.add({
          user_id: 'u1',
          action: 'UPDATE_USER',
          table_name: 'users',
          record_id: formData.employee_code || formData.full_name,
          description: `Đã cập nhật nhân viên ${formData.full_name} (${formData.employee_code}) - Quyền ${formData.role}`,
          event_type: 'USER_EVENT'
        }).catch(console.error);

        toast.success(`Đã cập nhật nhân viên "${formData.full_name}" trong Database!`);
        const adminId = formData.employee_code.trim();
        if (!adminId) {
          toast.error('Vui lòng nhập Mã ID nhân viên do Admin tạo!');
          return;
        }

        const newCreatedUser = await db.users.create({
          id: adminId,
          employee_code: adminId,
          full_name: formData.full_name,
          phone: formData.phone,
          role_id: selectedRoleId,
          active: true,
          password: formData.password || '123456'
        });

        await db.activityLogs.add({
          user_id: 'u1',
          action: 'CREATE_USER',
          table_name: 'users',
          record_id: newCreatedUser.employee_code || formData.full_name,
          description: `Đã thêm nhân viên mới ${formData.full_name} (${newCreatedUser.employee_code}) - Quyền ${formData.role}`,
          event_type: 'USER_EVENT'
        }).catch(console.error);

        toast.success(`Đã tạo mới nhân viên "${formData.full_name}" vào Database bảng users!`);
      }

      await loadUsersFromDb();
      handleCloseModal();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi lưu thông tin người dùng');
    }
  };

  const handleDeleteUser = (user: User) => {
    setUserToDelete(user);
  };

  const confirmDeleteUser = async (user: User) => {
    try {
      await db.users.delete(user.id);
      await db.activityLogs.add({
        user_id: 'u1',
        action: 'DELETE_USER',
        table_name: 'users',
        record_id: user.employee_code || user.full_name,
        description: `Đã xóa tài khoản nhân viên ${user.full_name} (${user.employee_code || user.id})`,
        event_type: 'USER_EVENT'
      }).catch(console.error);

      setUsers(prev => prev.filter(u => u.id !== user.id));
      toast.success(`Đã xóa thành công tài khoản "${user.full_name}" khỏi hệ thống!`);
    } catch (e: any) {
      toast.error(e.message || 'Lỗi khi xóa người dùng');
    } finally {
      setUserToDelete(null);
    }
  };

  const filteredUsers = users.filter(user => 
    String(user.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    String(user.employee_code || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-12 w-full max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
            <UsersIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-slate-900 dark:text-white">Quản Lý Người Dùng</h1>
            <p className="text-xs font-medium text-slate-500">Danh sách tài khoản và phân quyền hệ thống</p>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Tìm mã hoặc tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white sm:text-sm transition-colors"
            />
          </div>
          <button 
            onClick={() => handleOpenModal()}
            className="flex-none flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-semibold transition-colors shadow-sm shadow-blue-200 dark:shadow-blue-900/20 text-sm whitespace-nowrap"
          >
            <Plus className="w-4 h-4" /> 
            <span className="hidden sm:inline">Thêm Nhân Viên</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col w-full">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Nhân Viên
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Liên Hệ
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Phân Quyền
                  </th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Trạng Thái
                  </th>
                  <th scope="col" className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Thao Tác
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                              {user.full_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900 dark:text-white">
                            {user.full_name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Mã NV: {user.employee_code || '---'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 dark:text-white">{user.email}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{user.phone || '---'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                        user.role === 'Admin' 
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' 
                          : user.role === 'Supervisor'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {user.role === 'Admin' && <Shield className="w-3 h-3 mr-1" />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                        <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                          {user.status === 'active' ? 'Đang trực' : 'Ngoại tuyến'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleOpenModal(user)}
                          className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(user)}
                          className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-slate-200 dark:divide-slate-800 w-full overflow-y-auto">
          {filteredUsers.map((user) => (
            <div key={user.id} className="p-4 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <span className="text-sm font-bold text-slate-600 dark:text-slate-300">
                      {user.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {user.full_name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Mã NV: {user.employee_code || '---'}
                    </div>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-1.5">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                    user.role === 'Admin' 
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' 
                      : user.role === 'Supervisor'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                  }`}>
                    {user.role === 'Admin' && <Shield className="w-3 h-3 mr-1" />}
                    {user.role}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${user.status === 'active' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      {user.status === 'active' ? 'Đang trực' : 'Ngoại tuyến'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Email</div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white mt-0.5 truncate">
                    {user.email || '---'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Điện Thoại</div>
                  <div className="text-sm font-medium text-slate-900 dark:text-white mt-0.5 truncate">
                    {user.phone || '---'}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-1">
                <button 
                  onClick={() => handleOpenModal(user)}
                  className="p-2 bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  title="Sửa"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeleteUser(user)}
                  className="p-2 bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg transition-colors text-red-500 hover:text-red-600"
                  title="Xóa"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredUsers.length === 0 && (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            Không tìm thấy người dùng nào phù hợp.
          </div>
        )}
      </div>

      {/* Add User Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                {editingUser ? 'Chỉnh Sửa Nhân Viên' : 'Thêm Nhân Viên Mới'}
              </h3>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mã ID Nhân Viên (Admin tự tạo, không tự sinh) <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="VD: NV001, NV009..."
                  value={formData.employee_code}
                  onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                  disabled={!!editingUser} // Optional: don't allow changing code after creation
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Họ và Tên <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  placeholder="Nhập họ và tên"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm"
                />
              </div>
              {!editingUser && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Mật khẩu <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-slate-400" />
                    </div>
                    <input 
                      type="password" 
                      placeholder="Mật khẩu đăng nhập"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm"
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Vai Trò
                  </label>
                  <select 
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm"
                  >
                    <option value="Worker">Nhân viên kho</option>
                    <option value="Supervisor">Quản Lý</option>
                    <option value="Admin">Quản trị viên</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Số Điện Thoại
                  </label>
                  <input 
                    type="text" 
                    placeholder="Tùy chọn"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
              <button 
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button 
                onClick={handleSaveUser}
                disabled={!formData.employee_code || !formData.full_name || (!editingUser && !formData.password)}
                className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm shadow-blue-200 dark:shadow-blue-900/20 transition-colors disabled:opacity-50"
              >
                {editingUser ? 'Lưu Thay Đổi' : 'Tạo Tài Khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-sm p-6 space-y-4 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto text-red-600 dark:text-red-400">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Xác Nhận Xóa Tài Khoản</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                Bạn có chắc chắn muốn xóa tài khoản <span className="font-bold text-slate-800 dark:text-slate-200">{userToDelete.full_name}</span> ({userToDelete.employee_code || userToDelete.id}) không?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={() => confirmDeleteUser(userToDelete)}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors shadow-sm shadow-red-200 dark:shadow-red-900/20"
              >
                Xác Nhận Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
