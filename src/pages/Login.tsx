import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Mail, Loader2, Warehouse, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '../api/supabase';
import { db, isSupabaseConfigured } from '../api/dbClient';
import { isGoogleSheetConfigured } from '../config/sheetConfig';
import { useAuthStore } from '../stores/useAuthStore';
import { User } from '../types';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Vui lòng nhập Mã nhân viên hoặc Email'),
  password: z.string().min(6, 'Mật khẩu phải có ít nhất 6 ký tự'),
  full_name: z.string().optional(),
  employee_code: z.string().optional(),
  phone: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const { setAuth } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const [isSignUp, setIsSignUp] = useState(false);

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const identifier = data.identifier.trim();

      if (isSignUp) {
        // Đăng ký tài khoản mới trong bảng 'users'
        const employeeCode = data.employee_code || identifier;
        const fullName = data.full_name || identifier;
        const phone = data.phone || '';

        // 1. Tạo bản ghi mới trong bảng 'users' ở Database
        const newDbUser = await db.users.create({
          employee_code: employeeCode,
          full_name: fullName,
          phone: phone,
          role_id: 1, // Mặc định vai trò Worker (Nhân viên vận hành)
          active: true,
          password: data.password,
        });

        // 2. Nếu có kết nối Supabase Auth, đồng bộ tài khoản Auth
        if (isSupabaseConfigured()) {
          const email = `${employeeCode.toLowerCase()}@liftflow.local`;
          await getSupabase().auth.signUp({
            email,
            password: data.password,
            options: { data: { full_name: fullName, employee_code: employeeCode, phone } }
          }).catch(() => { });
        }

        const appUser: User = {
          id: newDbUser.id,
          email: `${newDbUser.employee_code || newDbUser.id}@liftflow.local`,
          full_name: newDbUser.full_name,
          employee_code: newDbUser.employee_code || undefined,
          phone: newDbUser.phone || undefined,
          role: 'Worker',
          created_at: newDbUser.created_at,
          updated_at: newDbUser.created_at,
        };

        setAuth(appUser);
        toast.success(`Đã tạo và đăng nhập tài khoản "${fullName}" trong hệ thống!`);
      } else {
        // 1. Tìm thông tin người dùng trực tiếp trong bảng 'users' database
        const result = await db.users.getByIdentifier(identifier);

        if (!result) {
          toast.error(`Không tìm thấy nhân viên "${identifier}". Vui lòng kiểm tra lại hoặc bấm Đăng ký.`);
          setIsLoading(false);
          return;
        }

        if (!result.user.active) {
          toast.error('Tài khoản này đã bị ngưng hoạt động trong hệ thống.');
          setIsLoading(false);
          return;
        }

        // 2. Xác thực mật khẩu bắt buộc (Kiểm tra theo thứ tự: mật khẩu bảng users -> Supabase Auth -> Mật khẩu mặc định 123456)
        let isPasswordCorrect = false;

        // 2.1. Kiểm tra mật khẩu trong bảng users (DB Supabase / local / Google Sheet)
        if (result.user.password && String(data.password).trim() === String(result.user.password).trim()) {
          isPasswordCorrect = true;
        }

        // 2.2. Nếu chưa khớp và Supabase Auth được bật, thử xác thực qua Supabase Auth
        if (!isPasswordCorrect && isSupabaseConfigured()) {
          try {
            const email = `${(result.user.employee_code || identifier).toLowerCase()}@liftflow.local`;
            const { error: sbError } = await getSupabase().auth.signInWithPassword({
              email,
              password: data.password,
            });
            if (!sbError) {
              isPasswordCorrect = true;
            }
          } catch {
            // Supabase Auth fallback
          }
        }

        // 2.3. Nếu tài khoản chưa có mật khẩu trong DB (tài khoản mẫu), chấp nhận mật khẩu mặc định '123456'
        if (!isPasswordCorrect && (!result.user.password || String(result.user.password).trim() === '') && String(data.password).trim() === '123456') {
          isPasswordCorrect = true;
        }

        if (!isPasswordCorrect) {
          toast.error('Mật khẩu không chính xác! Vui lòng kiểm tra lại.');
          setIsLoading(false);
          return;
        }

        // 3. Tạo đối tượng Auth từ thông tin lấy ra trong bảng 'users' và 'roles'
        const appUser: User = {
          id: result.user.id,
          email: `${result.user.employee_code || result.user.id}@liftflow.local`,
          full_name: result.user.full_name,
          employee_code: result.user.employee_code || undefined,
          phone: result.user.phone || undefined,
          role: result.roleName,
          created_at: result.user.created_at,
          updated_at: result.user.created_at,
        };

        // Set state đăng nhập thành công
        setAuth(appUser);
        toast.success(`Đã đăng nhập thành công: ${result.user.full_name} (${result.roleName})`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Lỗi xác thực người dùng');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Warehouse className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white">
          Warehouse Lift Dispatch System
        </h2>
        <p className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
          Hệ Thống Quản Lý Thang Tời Kho
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-slate-900 py-8 px-4 shadow sm:rounded-2xl sm:px-10 border border-slate-200 dark:border-slate-800">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Mã nhân viên / Tên đăng nhập
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  {...register('identifier')}
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm transition-colors"
                  placeholder="Nhập mã nhân viên hoặc email"
                />
              </div>
              {errors.identifier && <p className="mt-1 text-sm text-red-500">{errors.identifier.message}</p>}
            </div>

            {isSignUp && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Họ và tên
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...register('full_name')}
                      type="text"
                      className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm transition-colors"
                      placeholder="Nhập họ và tên"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Mã nhân viên
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...register('employee_code')}
                      type="text"
                      className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm transition-colors"
                      placeholder="VD: NV001"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Số điện thoại
                  </label>
                  <div className="mt-1 relative">
                    <input
                      {...register('phone')}
                      type="text"
                      className="block w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm transition-colors"
                      placeholder="Nhập số điện thoại"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Mật khẩu
              </label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  {...register('password')}
                  type="password"
                  className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white sm:text-sm transition-colors"
                  placeholder="Nhập mật khẩu"
                />
              </div>
              {errors.password && <p className="mt-1 text-sm text-red-500">{errors.password.message}</p>}
              {!isSignUp && (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-900 dark:text-slate-300">
                  Ghi nhớ đăng nhập
                </label>
              </div>

              <div className="text-sm">
                <a href="#" className="font-medium text-blue-600 hover:text-blue-500">
                  Quên mật khẩu?
                </a>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  isSignUp ? 'Đăng ký' : 'Đăng nhập'
                )}
              </button>
            </div>

            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300 dark:border-slate-700" />
              </div>
            </div>
            <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
              Đăng nhập bằng Mã NV hoặc liên hệ quản lý được biết thêm chi tiết.
            </div>

            {isGoogleSheetConfigured() && (
              <div className="mt-4 p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Cơ sở dữ liệu: Google Sheet (Đã kết nối)
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
