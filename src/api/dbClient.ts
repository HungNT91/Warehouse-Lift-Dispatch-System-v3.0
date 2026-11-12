import { getSupabase } from './supabase';
import {
  DbRole,
  DbUser,
  DbFloor,
  DbLiftStatus,
  DbLift,
  DbTransportJob,
  DbDailyAssignment,
  DbTelegramLog,
  DbActivityLog,
  DbSystemSetting,
  DbLiftCommand,
  DbLiftReservation,
  DbJobTimeline,
  DbUserDevice,
  DbNotification
} from '../types/database';
import {
  getStoredRestrictionForLift,
  saveStoredFloorRestriction,
  mergeRemoteFloorRestrictions,
  loadStoredFloorRestrictions
} from '../utils/floorRestrictions';
import { googleSheetClient } from './googleSheetClient';
import { isGoogleSheetConfigured } from '../config/sheetConfig';

export { isGoogleSheetConfigured };

// Sync all data from Google Sheet into memory & localStorage
export const syncGoogleSheetData = async (): Promise<boolean> => {
  if (!isGoogleSheetConfigured()) return false;
  try {
    const data = await googleSheetClient.fetchAll();
    if (!data) return false;

    if (Array.isArray(data.users) && data.users.length > 0) {
      mockDbData.users = data.users.map(u => {
        const rawId = String(u.id || '').trim();
        const empCode = String(u.employee_code || '').trim();
        // ID do admin tạo trong sheet Users; nếu trước đó là UUID giả lập thì ưu tiên mã NV (NV001)
        const cleanId = rawId && !isUuid(rawId) ? rawId : (empCode || rawId || `NV${Date.now().toString().slice(-4)}`);
        return {
          ...u,
          id: cleanId,
          employee_code: empCode || cleanId,
          full_name: String(u.full_name || ''),
          phone: u.phone !== undefined && u.phone !== null ? String(u.phone) : '',
          email: u.email ? String(u.email) : '',
          role_id: Number(u.role_id) || 3,
          active: u.active === true || String(u.active).toLowerCase() === 'true',
          password: String(u.password !== undefined && u.password !== null ? u.password : '123456')
        };
      });
      cachedUsers = mockDbData.users;
    }

    if (Array.isArray(data.lifts) && data.lifts.length > 0) {
      mockDbData.lifts = data.lifts.map(l => {
        const code = String(l.lift_code || l.id || '').trim();
        const id = String(l.id || code).trim();
        const name = String(l.lift_name || `Thang ${code || id}`).trim();
        let currFloor = String(l.current_floor || '1').trim();
        const numMatch = currFloor.match(/\d+/);
        if (numMatch) currFloor = numMatch[0];
        else currFloor = '1';

        return {
          ...l,
          id: id,
          lift_code: code || id,
          lift_name: name,
          current_floor: currFloor,
          status_id: Number(l.status_id) || 1,
          has_cargo: l.has_cargo === true || String(l.has_cargo).toLowerCase() === 'true',
          allowed_floors: Array.isArray(l.allowed_floors) ? l.allowed_floors : [1, 2, 3, 4]
        };
      });
      cachedLifts = mockDbData.lifts;
    }

    if (Array.isArray(data.transportJobs) && data.transportJobs.length > 0) {
      mockDbData.transportJobs = data.transportJobs.map(j => {
        const rawFrom = String(j.from_floor || '1').trim();
        const rawTo = String(j.to_floor || '2').trim();
        const fromNum = rawFrom.match(/\d+/) ? rawFrom.match(/\d+/)![0] : '1';
        const toNum = rawTo.match(/\d+/) ? rawTo.match(/\d+/)![0] : '2';
        const rawLift = String(j.lift_id || 'P1').trim();
        const liftCode = rawLift.startsWith('P') ? rawLift : (rawLift.match(/\d+/) ? `P${rawLift.match(/\d+/)![0]}` : rawLift);
        const jobId = String(j.id || j.job_no || '');
        const jobNo = String(j.job_no || j.id || '');
        return {
          ...j,
          id: jobId,
          job_no: jobNo,
          lift_id: liftCode,
          from_floor: fromNum,
          to_floor: toNum,
          sender_id: String(j.sender_id || ''),
          receiver_id: j.receiver_id ? String(j.receiver_id) : null,
        };
      });
    }

    if (Array.isArray(data.dailyAssignments)) {
      mockDbData.dailyAssignments = data.dailyAssignments;
    }

    if (Array.isArray(data.notifications)) {
      mockDbData.notifications = data.notifications;
    }

    if (Array.isArray(data.activityLogs)) {
      mockDbData.activityLogs = data.activityLogs;
    }

    if (Array.isArray(data.systemSettings)) {
      mockDbData.systemSettings = data.systemSettings;
    }

    saveMockData();
    return true;
  } catch (err) {
    console.warn('[dbClient] syncGoogleSheetData error:', err);
    return false;
  }
};

// Helper to check if Supabase is initialized
export const isSupabaseConfigured = (): boolean => {
  // Khi đã cấu hình Google Sheet, ưu tiên hoàn toàn Google Sheet và bỏ qua Supabase
  if (isGoogleSheetConfigured()) {
    return false;
  }
  try {
    const url = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
    const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^['"]|['"]$/g, '');
    if (!url || !key) return false;
    // Kiểm tra nếu dán nhầm URL vào ô Key, hoặc key giả lập không hợp lệ
    if (
      key.startsWith('http') ||
      key.length < 20 ||
      url.includes('your-project-id') ||
      url.includes('YOUR_SUPABASE') ||
      key.includes('your-anon-key') ||
      url === "''" ||
      key === "''"
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

// UUID validator helper
export const isUuid = (str: any): boolean => {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

// Caches for DB resolution
let cachedFloors: DbFloor[] = [];
let cachedLifts: DbLift[] = [];
let cachedUsers: DbUser[] = [];
let _lastRestrictionSyncTime = 0;

// Helper to generate sequential Job No: TR-ddmmyyyy-xxxx
export const generateJobNo = (existingJobs: { job_no?: string; id?: string }[], date: Date = new Date()): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const prefix = `TR-${day}${month}${year}-`;

  let maxSeq = 0;
  (existingJobs || []).forEach(job => {
    const code = String(job.job_no || job.id || '').trim();
    if (code.startsWith(prefix)) {
      const numPart = code.slice(prefix.length);
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
};

// Clean resolution helpers for Google Sheets & standard references
export const resolveFloorId = (floorVal: any): string => {
  if (typeof floorVal === 'number') return String(floorVal);
  if (!floorVal) return '1';
  const str = String(floorVal).trim();
  const numMatch = str.match(/\d+/);
  return numMatch ? numMatch[0] : '1';
};

export const resolveLiftId = (liftVal: any): string => {
  if (!liftVal) return 'P1';
  const str = String(liftVal).trim();
  if (/^P\d+$/i.test(str)) return str.toUpperCase();
  const allLifts = cachedLifts.length > 0 ? cachedLifts : mockDbData.lifts;
  const matched = allLifts.find(l =>
    l.id === str ||
    (l.lift_code && l.lift_code.toLowerCase() === str.toLowerCase()) ||
    (l.lift_name && l.lift_name.toLowerCase() === str.toLowerCase())
  );
  if (matched) return matched.lift_code || matched.id;
  const numMatch = str.match(/\d+/);
  if (numMatch) return `P${numMatch[0]}`;
  return str;
};

export const resolveUserId = (userVal: any): string => {
  if (!userVal) return 'NV001';
  const str = String(userVal).trim();
  const allUsers = cachedUsers.length > 0 ? cachedUsers : mockDbData.users;
  const matched = allUsers.find(u =>
    u.id === str ||
    (u.employee_code && String(u.employee_code).toLowerCase() === str.toLowerCase()) ||
    (u.full_name && String(u.full_name).toLowerCase() === str.toLowerCase())
  );
  if (matched) return matched.employee_code || matched.id;
  return str;
};

// Helper functions to resolve floor, lift, user (only converts to UUID when Supabase is explicitly configured)
export const resolveFloorUuid = (floorVal: any): string => {
  if (!isSupabaseConfigured()) {
    return resolveFloorId(floorVal);
  }
  let num = 1;
  if (typeof floorVal === 'number') {
    num = floorVal;
  } else if (floorVal) {
    const parsed = parseInt(String(floorVal).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed > 0) num = parsed;
  }

  if (isUuid(floorVal)) {
    const matchedExact = cachedFloors.find(f => f.id === floorVal);
    if (matchedExact) return matchedExact.id;
  }

  const matched = cachedFloors.find(f => f.floor_no === num);
  if (matched && isUuid(matched.id)) return matched.id;
  if (cachedFloors.length > 0 && isUuid(cachedFloors[0].id)) return cachedFloors[(num - 1) % cachedFloors.length].id;

  const fallbacks: Record<number, string> = {
    1: '11111111-1111-4111-a111-111111111111',
    2: '11111111-1111-4111-a111-222222222222',
    3: '11111111-1111-4111-a111-333333333333',
    4: '11111111-1111-4111-a111-444444444444',
  };
  return fallbacks[num] || '11111111-1111-4111-a111-111111111111';
};

export const resolveLiftUuid = (liftVal: any): string => {
  if (!isSupabaseConfigured()) {
    return resolveLiftId(liftVal);
  }
  if (isUuid(liftVal)) {
    const matchedExact = cachedLifts.find(l => l.id === liftVal);
    if (matchedExact) return matchedExact.id;
  }

  const str = String(liftVal || '').toLowerCase();
  const matched = cachedLifts.find(l =>
    l.id === liftVal ||
    (l.lift_code && l.lift_code.toLowerCase() === str) ||
    (l.lift_name && l.lift_name.toLowerCase().includes(str.replace(/[^0-9]/g, '')))
  );
  if (matched && isUuid(matched.id)) return matched.id;
  if (cachedLifts.length > 0 && isUuid(cachedLifts[0].id)) {
    const idx = (parseInt(str.replace(/[^0-9]/g, ''), 10) || 1) - 1;
    return cachedLifts[Math.max(0, idx % cachedLifts.length)].id;
  }

  const num = parseInt(str.replace(/[^0-9]/g, ''), 10) || 1;
  const fallbacks: Record<number, string> = {
    1: '22222222-2222-4222-a222-111111111111',
    2: '22222222-2222-4222-a222-222222222222',
    3: '22222222-2222-4222-a222-333333333333',
    4: '22222222-2222-4222-a222-444444444444',
    5: '22222222-2222-4222-a222-555555555555',
  };
  return fallbacks[num] || '22222222-2222-4222-a222-111111111111';
};

export const resolveUserUuid = (userVal: any, fallbackIndex: number = 1): string => {
  if (!isSupabaseConfigured()) {
    return resolveUserId(userVal);
  }
  if (isUuid(userVal)) {
    return String(userVal);
  }

  if (userVal) {
    const str = String(userVal).toLowerCase();
    const matched = cachedUsers.find(u =>
      u.id === userVal ||
      (u.employee_code && String(u.employee_code).toLowerCase() === str) ||
      (u.full_name && String(u.full_name).toLowerCase().includes(str))
    );
    if (matched && isUuid(matched.id)) return matched.id;
  }

  if (cachedUsers.length > 0 && isUuid(cachedUsers[0].id)) {
    return cachedUsers[(fallbackIndex - 1) % cachedUsers.length].id;
  }

  const fallbacks: Record<string, string> = {
    'u1': '33333333-3333-4333-a333-111111111111',
    'u2': '33333333-3333-4333-a333-222222222222',
    'u3': '33333333-3333-4333-a333-333333333333',
    'u4': '33333333-3333-4333-a333-444444444444',
  };
  if (userVal && fallbacks[String(userVal).toLowerCase()]) return fallbacks[String(userVal).toLowerCase()];

  return '33333333-3333-4333-a333-111111111111';
};

// Generic table helper
export const db = {
  // 1. Roles
  roles: {
    async getAll(): Promise<DbRole[]> {
      if (!isSupabaseConfigured()) return mockDbData.roles;
      const { data, error } = await getSupabase().from('roles').select('*');
      if (error) {
        console.warn('Supabase error fetching roles:', error.message);
        return [];
      }
      return data || [];
    }
  },

  // 2. Users
  users: {
    async getAll(): Promise<DbUser[]> {
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await getSupabase().from('users').select('*');
          if (!error && data) {
            cachedUsers = data;
            return data;
          } else if (error) {
            console.warn('Supabase users fetch warning:', error.message);
            return [];
          }
        } catch (e) {
          console.warn('Exception fetching users from Supabase:', e);
          return [];
        }
      }

      cachedUsers = mockDbData.users;
      return mockDbData.users;
    },
    async getByIdentifier(identifier: string): Promise<{ user: DbUser; roleName: 'Admin' | 'Supervisor' | 'Worker' } | null> {
      const trimmed = identifier.trim();
      const lower = trimmed.toLowerCase();
      const cleanLower = lower.replace(/[^a-z0-9]/g, '');

      let allUsers: DbUser[] = [];
      let allRoles: DbRole[] = [];

      try {
        allUsers = await this.getAll();
        allRoles = await db.roles.getAll();
      } catch {
        allUsers = mockDbData.users;
        allRoles = mockDbData.roles;
      }

      // 1. Precise or normalized matching
      let matchedUser = allUsers.find(u => {
        const empCode = u.employee_code ? String(u.employee_code).toLowerCase() : '';
        const cleanEmpCode = empCode.replace(/[^a-z0-9]/g, '');
        const phone = u.phone !== undefined && u.phone !== null ? String(u.phone).toLowerCase() : '';
        const fullName = u.full_name ? String(u.full_name).toLowerCase() : '';
        const email = u.email ? String(u.email).toLowerCase() : '';
        const id = u.id ? String(u.id).toLowerCase() : '';

        return (
          (empCode && empCode === lower) ||
          (cleanEmpCode && cleanLower && cleanEmpCode === cleanLower) ||
          (email && email === lower) ||
          (email && lower.includes('@') && email.split('@')[0] === lower.split('@')[0]) ||
          (phone && phone === lower) ||
          (fullName && fullName === lower) ||
          (id && id === lower)
        );
      });

      // 2. Partial / Fuzzy matching fallback
      if (!matchedUser) {
        matchedUser = allUsers.find(u => {
          const empCode = u.employee_code ? String(u.employee_code).toLowerCase() : '';
          const cleanEmpCode = empCode.replace(/[^a-z0-9]/g, '');
          const fullName = u.full_name ? String(u.full_name).toLowerCase() : '';
          const email = u.email ? String(u.email).toLowerCase() : '';
          const phone = u.phone !== undefined && u.phone !== null ? String(u.phone).toLowerCase() : '';

          return (
            (cleanEmpCode && cleanLower.length >= 3 && (cleanEmpCode.includes(cleanLower) || cleanLower.includes(cleanEmpCode))) ||
            (email && lower.length >= 3 && email.includes(lower)) ||
            (fullName && lower.length >= 3 && fullName.includes(lower)) ||
            (phone && lower.length >= 3 && phone.includes(lower))
          );
        });
      }

      // 3. Keyword role fallback
      if (!matchedUser) {
        if (lower.includes('admin')) {
          matchedUser = allUsers.find(u => u.role_id === 1 || u.employee_code?.includes('001')) || allUsers[0];
        } else if (lower.includes('super')) {
          matchedUser = allUsers.find(u => u.role_id === 2 || u.employee_code?.includes('002')) || allUsers[1];
        } else if (lower.includes('worker')) {
          matchedUser = allUsers.find(u => u.role_id === 3 || u.employee_code?.includes('003')) || allUsers[2];
        }
      }

      if (!matchedUser) return null;

      const roleObj = allRoles.find(r => r.id === matchedUser!.role_id);
      let roleName: 'Admin' | 'Supervisor' | 'Worker' = 'Worker';
      if (roleObj) {
        const name = roleObj.role_name.toLowerCase();
        if (name.includes('admin')) roleName = 'Admin';
        else if (name.includes('super')) roleName = 'Supervisor';
        else roleName = 'Worker';
      } else if (matchedUser.role_id === 1) {
        roleName = 'Admin';
      } else if (matchedUser.role_id === 2) {
        roleName = 'Supervisor';
      }

      return { user: matchedUser, roleName };
    },
    async create(user: Omit<DbUser, 'id' | 'created_at'> & { id?: string }): Promise<DbUser> {
      const adminId = (user.id || user.employee_code || '').trim() || `NV${Math.floor(100 + Math.random() * 899)}`;
      const newUser: DbUser = {
        ...user,
        id: adminId,
        employee_code: user.employee_code?.trim() || adminId,
        created_at: new Date().toISOString()
      };
      if (isSupabaseConfigured()) {
        const { data, error } = await getSupabase().from('users').insert([newUser]).select().single();
        if (!error && data) {
          mockDbData.users.push(data);
          saveMockData();
          return data;
        }
      }
      mockDbData.users.push(newUser);
      cachedUsers = mockDbData.users;
      saveMockData();
      if (isGoogleSheetConfigured()) {
        googleSheetClient.postAction('createUser', newUser).catch(console.error);
      }
      return newUser;
    },
    async update(id: string, updates: Partial<DbUser>): Promise<boolean> {
      if (isSupabaseConfigured()) {
        const { error } = await getSupabase().from('users').update(updates).eq('id', id);
        if (!error) {
          const idx = mockDbData.users.findIndex(u => u.id === id);
          if (idx !== -1) mockDbData.users[idx] = { ...mockDbData.users[idx], ...updates };
          saveMockData();
          return true;
        }
      }
      const idx = mockDbData.users.findIndex(u => u.id === id);
      if (idx !== -1) {
        mockDbData.users[idx] = { ...mockDbData.users[idx], ...updates };
        saveMockData();
        if (isGoogleSheetConfigured()) {
          googleSheetClient.postAction('updateUser', { id, ...updates }).catch(console.error);
        }
        return true;
      }
      return false;
    },
    async delete(id: string): Promise<boolean> {
      if (isSupabaseConfigured()) {
        try {
          const supabase = getSupabase();
          await supabase.from('daily_assignments').delete().eq('user_id', id);
          await supabase.from('user_devices').delete().eq('user_id', id);
          await supabase.from('telegram_logs').update({ user_id: null }).eq('user_id', id);
          await supabase.from('activity_logs').update({ user_id: null }).eq('user_id', id);
          await supabase.from('transport_jobs').update({ worker_id: null }).eq('worker_id', id);
          await supabase.from('transport_jobs').update({ created_by: null }).eq('created_by', id);
          await supabase.from('transport_jobs').update({ sender_id: null }).eq('sender_id', id);
          await supabase.from('transport_jobs').update({ receiver_id: null }).eq('receiver_id', id);

          const { error } = await supabase.from('users').delete().eq('id', id);
          if (error) {
            console.warn('Supabase delete user error:', error.message);
            await supabase.from('users').update({ active: false }).eq('id', id);
          }
        } catch (e) {
          console.warn('Exception deleting user from Supabase:', e);
        }
      }
      mockDbData.users = mockDbData.users.filter(u => u.id !== id && u.employee_code !== id);
      cachedUsers = cachedUsers.filter(u => u.id !== id && u.employee_code !== id);
      saveMockData();
      return true;
    }
  },

  // 3. User Devices
  userDevices: {
    async getByUserId(userId: string): Promise<DbUserDevice[]> {
      if (!isSupabaseConfigured()) return mockDbData.userDevices.filter(d => d.user_id === userId);
      const { data } = await getSupabase().from('user_devices').select('*').eq('user_id', userId);
      return data || [];
    }
  },

  // 4. Floors
  floors: {
    async getAll(): Promise<DbFloor[]> {
      if (!isSupabaseConfigured()) return mockDbData.floors;
      try {
        const { data, error } = await getSupabase().from('floors').select('*').order('floor_no', { ascending: true });
        if (!error && data && data.length > 0) {
          cachedFloors = data;
          return data;
        }
        // Auto-seed default floors in Supabase if empty
        const seedFloors: DbFloor[] = [
          { id: '11111111-1111-4111-a111-111111111111', floor_no: 1, floor_name: 'Tầng 1 - Kho Nhận & Xuất Hàng', created_at: new Date().toISOString() },
          { id: '11111111-1111-4111-a111-222222222222', floor_no: 2, floor_name: 'Tầng 2 - Kho Linh Kiện A', created_at: new Date().toISOString() },
          { id: '11111111-1111-4111-a111-333333333333', floor_no: 3, floor_name: 'Tầng 3 - Kho Thành Phẩm B', created_at: new Date().toISOString() },
          { id: '11111111-1111-4111-a111-444444444444', floor_no: 4, floor_name: 'Tầng 4 - Xưởng Gia Công & Đóng Gói', created_at: new Date().toISOString() },
        ];
        try {
          await getSupabase().from('floors').insert(seedFloors);
        } catch { }
        cachedFloors = seedFloors;
        return seedFloors;
      } catch (err) {
        console.warn('Exception fetching floors:', err);
        return [];
      }
    }
  },

  // 5. Lift Status
  liftStatus: {
    async getAll(): Promise<DbLiftStatus[]> {
      if (!isSupabaseConfigured()) return mockDbData.liftStatus;
      const { data } = await getSupabase().from('lift_status').select('*');
      return data || [];
    }
  },

  // 6. Lifts
  lifts: {
    async getAll(): Promise<DbLift[]> {
      const enrichWithFloorRestrictions = (items: DbLift[]): DbLift[] => {
        return items.map(lift => {
          // localStorage là nguồn chân lý cho giới hạn tầng (đã có cơ chế tự hết hạn theo ngày)
          const stored = getStoredRestrictionForLift(lift.id, lift.lift_code, lift.lift_name);
          const localItem = mockDbData.lifts.find(l => l.id === lift.id || l.lift_code === lift.lift_code || (l.lift_name && lift.lift_name && l.lift_name === lift.lift_name));

          if (stored?.allowed_floors && stored.allowed_floors.length < 4) {
            // Có giới hạn hợp lệ trong localStorage → ưu tiên dùng
            return {
              ...lift,
              allowed_floors: stored.allowed_floors,
              restricted_by_user_id: stored.restricted_by_user_id || null,
              restricted_by_name: stored.restricted_by_name || null,
              restricted_at: stored.restricted_at || null,
              restriction_date: stored.restriction_date || null,
              pickup_start_time: lift.pickup_start_time || localItem?.pickup_start_time || null
            };
          }

          // Không có giới hạn trong localStorage → tời hoạt động không giới hạn
          // Ưu tiên mockDbData local nếu có allowed_floors hợp lệ (< 4), nhưng kiểm tra restriction_date
          const localHasActiveRestr = Boolean(
            localItem?.allowed_floors &&
            localItem.allowed_floors.length < 4 &&
            localItem.restriction_date &&
            localItem.restriction_date === new Date().toLocaleDateString('en-CA')
          );

          return {
            ...lift,
            allowed_floors: localHasActiveRestr ? localItem!.allowed_floors! : [1, 2, 3, 4],
            restricted_by_user_id: localHasActiveRestr ? (localItem!.restricted_by_user_id || null) : null,
            restricted_by_name: localHasActiveRestr ? (localItem!.restricted_by_name || null) : null,
            restricted_at: localHasActiveRestr ? (localItem!.restricted_at || null) : null,
            restriction_date: localHasActiveRestr ? localItem!.restriction_date! : null,
            pickup_start_time: lift.pickup_start_time || localItem?.pickup_start_time || null
          };
        });
      };

      if (!isSupabaseConfigured()) return enrichWithFloorRestrictions(mockDbData.lifts);
      try {
        // Đồng bộ cấu hình giới hạn tầng từ bảng system_settings nếu có (cache 60s để tránh lặp lại query liên tục)
        const now = Date.now();
        if (now - _lastRestrictionSyncTime > 60_000) {
          _lastRestrictionSyncTime = now;
          try {
            const { data: settingData } = await getSupabase()
              .from('system_settings')
              .select('*')
              .eq('setting_key', 'LIFT_FLOOR_RESTRICTIONS')
              .maybeSingle();
            if (settingData?.setting_value) {
              const parsed = JSON.parse(settingData.setting_value);
              mergeRemoteFloorRestrictions(parsed);
            }
          } catch { }
        }

        const { data, error } = await getSupabase().from('lifts').select('*');
        if (!error && data && data.length > 0) {
          const enriched = enrichWithFloorRestrictions(data);
          cachedLifts = enriched;
          return enriched;
        }
        // Auto-seed default lifts in Supabase if empty
        const seedLifts: DbLift[] = [
          { id: '22222222-2222-4222-a222-111111111111', lift_code: 'L1', lift_name: 'Tời 01', current_floor: '11111111-1111-4111-a111-111111111111', status_id: 1, has_cargo: false, last_update: new Date().toISOString() },
          { id: '22222222-2222-4222-a222-222222222222', lift_code: 'L2', lift_name: 'Tời 02', current_floor: '11111111-1111-4111-a111-222222222222', status_id: 1, has_cargo: false, last_update: new Date().toISOString() },
          { id: '22222222-2222-4222-a222-333333333333', lift_code: 'L3', lift_name: 'Tời 03', current_floor: '11111111-1111-4111-a111-333333333333', status_id: 1, has_cargo: false, last_update: new Date().toISOString() },
          { id: '22222222-2222-4222-a222-444444444444', lift_code: 'L4', lift_name: 'Tời 04', current_floor: '11111111-1111-4111-a111-444444444444', status_id: 1, has_cargo: false, last_update: new Date().toISOString() },
          { id: '22222222-2222-4222-a222-555555555555', lift_code: 'L5', lift_name: 'Tời 05', current_floor: '11111111-1111-4111-a111-111111111111', status_id: 1, has_cargo: false, last_update: new Date().toISOString() },
        ];
        try {
          await getSupabase().from('lifts').insert(seedLifts);
        } catch { }
        const enrichedSeed = enrichWithFloorRestrictions(seedLifts);
        cachedLifts = enrichedSeed;
        return enrichedSeed;
      } catch (err) {
        console.warn('Exception fetching lifts:', err);
        return enrichWithFloorRestrictions(mockDbData.lifts);
      }
    },
    async update(id: string, updates: Partial<DbLift>): Promise<boolean> {
      const realLiftId = resolveLiftId(id);
      const cleanUpdates: any = { ...updates };
      if (cleanUpdates.current_floor !== undefined && cleanUpdates.current_floor !== null) {
        cleanUpdates.current_floor = resolveFloorId(cleanUpdates.current_floor);
      }
      if (cleanUpdates.current_job) {
        cleanUpdates.current_job = String(cleanUpdates.current_job);
      }
      cleanUpdates.id = realLiftId;
      cleanUpdates.lift_code = realLiftId;

      // Save floor restriction persistently
      if (cleanUpdates.allowed_floors !== undefined) {
        saveStoredFloorRestriction(id, {
          allowed_floors: cleanUpdates.allowed_floors,
          restricted_by_user_id: cleanUpdates.restricted_by_user_id,
          restricted_by_name: cleanUpdates.restricted_by_name,
          restricted_at: cleanUpdates.restricted_at,
          restriction_date: cleanUpdates.restriction_date
        });
        if (realLiftId !== id) {
          saveStoredFloorRestriction(realLiftId, {
            allowed_floors: cleanUpdates.allowed_floors,
            restricted_by_user_id: cleanUpdates.restricted_by_user_id,
            restricted_by_name: cleanUpdates.restricted_by_name,
            restricted_at: cleanUpdates.restricted_at,
            restriction_date: cleanUpdates.restriction_date
          });
        }
        // Đồng bộ lên bảng system_settings để mọi tab/thiết bị khác nhận được tức thì qua polling/realtime
        db.systemSettings.updateSetting('LIFT_FLOOR_RESTRICTIONS', JSON.stringify(loadStoredFloorRestrictions())).catch(console.error);
      }

      if (isSupabaseConfigured()) {
        const supabaseUpdates = { ...cleanUpdates };
        delete supabaseUpdates.pickup_start_time;

        let { error } = await getSupabase().from('lifts').update({ ...supabaseUpdates, last_update: new Date().toISOString() }).eq('id', realLiftId);
        
        // If error might be due to unmigrated columns, fallback without custom columns
        if (error) {
          console.warn('Supabase error updating lift with full columns, trying fallback:', error.message);
          const fallbackUpdates = { ...supabaseUpdates };
          delete fallbackUpdates.allowed_floors;
          delete fallbackUpdates.restricted_by_user_id;
          delete fallbackUpdates.restricted_by_name;
          delete fallbackUpdates.restricted_at;
          delete fallbackUpdates.restriction_date;
          const retry = await getSupabase().from('lifts').update({ ...fallbackUpdates, last_update: new Date().toISOString() }).eq('id', realLiftId);
          error = retry.error;
        }

        if (!error) {
          const idx = mockDbData.lifts.findIndex(l => l.id === id || l.id === realLiftId || l.lift_code === id);
          if (idx !== -1) mockDbData.lifts[idx] = { ...mockDbData.lifts[idx], ...cleanUpdates, last_update: new Date().toISOString() };
          saveMockData();
          return true;
        } else {
          console.warn('Supabase error updating lift:', error.message);
        }
      }
      const idx = mockDbData.lifts.findIndex(l => l.id === id || l.id === realLiftId || l.lift_code === id);
      if (idx !== -1) {
        mockDbData.lifts[idx] = {
          ...mockDbData.lifts[idx],
          ...cleanUpdates,
          last_update: new Date().toISOString()
        };
        saveMockData();
        if (isGoogleSheetConfigured()) {
          googleSheetClient.postAction('updateLift', { id: realLiftId, ...cleanUpdates }).catch(console.error);
        }
        return true;
      }
      return false;
    }
  },

  // 7. Lift Commands (Lưu vào bộ nhớ đệm thiết bị localStorage, không gọi API Supabase tránh lãng phí request)
  liftCommands: {
    async create(cmd: Omit<DbLiftCommand, 'id' | 'created_at'>): Promise<DbLiftCommand> {
      const newCmd: DbLiftCommand = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        command: cmd.command,
        payload: cmd.payload || null,
        status: cmd.status || 'PENDING',
        lift_id: resolveLiftUuid(cmd.lift_id),
        created_by: resolveUserUuid(cmd.created_by)
      };
      mockDbData.liftCommands.push(newCmd);
      saveMockData();
      return newCmd;
    }
  },

  // 8. Lift Reservations
  liftReservations: {
    async getAll(): Promise<DbLiftReservation[]> {
      if (!isSupabaseConfigured()) return mockDbData.liftReservations;
      try {
        const { data, error } = await getSupabase().from('lift_reservations').select('*');
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    },
    async create(res: Omit<DbLiftReservation, 'id' | 'created_at'>): Promise<DbLiftReservation> {
      const newRes: DbLiftReservation = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        lift_id: resolveLiftUuid(res.lift_id),
        from_floor_id: resolveFloorUuid(res.from_floor_id),
        to_floor_id: resolveFloorUuid(res.to_floor_id),
        reserved_by: resolveUserUuid(res.reserved_by),
        start_time: res.start_time || new Date().toISOString(),
        end_time: res.end_time || null,
        reason: res.reason || null,
        active: res.active ?? true
      };
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await getSupabase().from('lift_reservations').insert([newRes]).select().single();
          if (error) {
            console.warn('Supabase error creating lift_reservation:', error.message);
          } else if (data) {
            mockDbData.liftReservations.push(data);
            saveMockData();
            return data;
          }
        } catch (e) {
          console.warn('Supabase exception creating lift_reservation:', e);
        }
      }
      mockDbData.liftReservations.push(newRes);
      saveMockData();
      return newRes;
    }
  },

  // 9. Daily Assignments
  dailyAssignments: {
    async getAll(): Promise<DbDailyAssignment[]> {
      if (!isSupabaseConfigured()) return mockDbData.dailyAssignments;
      try {
        const { data, error } = await getSupabase().from('daily_assignments').select('*');
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    },
    async create(assignment: Omit<DbDailyAssignment, 'id' | 'created_at'> & { id?: string }): Promise<DbDailyAssignment> {
      const workDate = assignment.work_date || new Date().toISOString().split('T')[0];
      const userId = resolveUserId(assignment.user_id);
      const liftId = resolveLiftId(assignment.lift_id);
      const floorId = resolveFloorId(assignment.floor_id);

      const newAssignment: DbDailyAssignment = {
        id: assignment.id || `ASG-${workDate.replace(/-/g, '')}-${userId}`,
        created_at: new Date().toISOString(),
        work_date: workDate,
        user_id: userId,
        floor_id: floorId,
        lift_id: liftId,
        shift: assignment.shift || 'CA_1'
      };
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await getSupabase()
            .from('daily_assignments')
            .upsert(newAssignment, { onConflict: 'work_date, user_id' })
            .select()
            .single();

          if (error) {
            console.warn('Supabase error creating daily_assignment:', error.message);
            // Fallback: try update if upsert failed due to constraint name difference
            const { data: updateData } = await getSupabase()
              .from('daily_assignments')
              .update({ floor_id: newAssignment.floor_id, lift_id: newAssignment.lift_id, shift: newAssignment.shift })
              .eq('work_date', newAssignment.work_date)
              .eq('user_id', newAssignment.user_id)
              .select()
              .maybeSingle();

            if (updateData) {
              const idx = mockDbData.dailyAssignments.findIndex(a => a.user_id === newAssignment.user_id && a.work_date === newAssignment.work_date);
              if (idx !== -1) mockDbData.dailyAssignments[idx] = updateData;
              else mockDbData.dailyAssignments.push(updateData);
              saveMockData();
              return updateData;
            }
          } else if (data) {
            const idx = mockDbData.dailyAssignments.findIndex(a => a.user_id === newAssignment.user_id && a.work_date === newAssignment.work_date);
            if (idx !== -1) mockDbData.dailyAssignments[idx] = data;
            else mockDbData.dailyAssignments.push(data);
            saveMockData();
            return data;
          }
        } catch (e) {
          console.warn('Supabase exception creating daily_assignment:', e);
        }
      }
      const existingIdx = mockDbData.dailyAssignments.findIndex(a => a.user_id === newAssignment.user_id && a.work_date === newAssignment.work_date);
      if (existingIdx !== -1) {
        mockDbData.dailyAssignments[existingIdx] = { ...mockDbData.dailyAssignments[existingIdx], ...newAssignment };
      } else {
        mockDbData.dailyAssignments.push(newAssignment);
      }
      saveMockData();
      if (isGoogleSheetConfigured()) {
        googleSheetClient.postAction('createAssignment', newAssignment).catch(console.error);
      }
      return newAssignment;
    }
  },

  // 10. Transport Jobs
  transportJobs: {
    async getAll(): Promise<DbTransportJob[]> {
      let supabaseJobs: DbTransportJob[] = [];
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await getSupabase()
            .from('transport_jobs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(150);
          if (!error && data && data.length > 0) {
            supabaseJobs = data;
          } else if (error) {
            console.warn('Supabase transport_jobs fetch warning:', error.message);
          }
        } catch (err) {
          console.warn('Exception fetching transport_jobs from Supabase:', err);
        }
      }

      // Hợp nhất thông minh giữa Supabase và Local Mock DB để không bao giờ bị mất đơn mới
      const mergedMap = new Map<string, DbTransportJob>();
      
      // 1. Đưa dữ liệu Supabase vào trước
      supabaseJobs.forEach(job => {
        const key = job.job_no || job.id;
        mergedMap.set(key, job);
      });

      // 2. Bổ sung các đơn trong mockDbData nếu chưa có hoặc có cập nhật mới hơn
      mockDbData.transportJobs.forEach(localJob => {
        const key = localJob.job_no || localJob.id;
        if (!mergedMap.has(key)) {
          mergedMap.set(key, localJob);
        } else {
          // Ưu tiên bản ghi có completed_at hoặc trạng thái mới hơn
          const existing = mergedMap.get(key)!;
          if (localJob.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
            mergedMap.set(key, { ...existing, ...localJob });
          }
        }
      });

      const allJobs = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Cập nhật lại cache mockDbData để luôn đồng bộ
      mockDbData.transportJobs = allJobs;
      saveMockData();

      return allJobs;
    },

    async create(job: Omit<DbTransportJob, 'id' | 'created_at'>): Promise<DbTransportJob> {
      // Đảm bảo cache dữ liệu tĩnh đã được nạp từ Supabase
      if (isSupabaseConfigured()) {
        try {
          await Promise.all([
            cachedUsers.length === 0 ? db.users.getAll().catch(() => []) : Promise.resolve([]),
            cachedFloors.length === 0 ? db.floors.getAll().catch(() => []) : Promise.resolve([]),
            cachedLifts.length === 0 ? db.lifts.getAll().catch(() => []) : Promise.resolve([])
          ]);
        } catch { }
      }

      const senderUuid = resolveUserUuid(job.sender_id, 1);
      const receiverUuid = job.receiver_id ? resolveUserUuid(job.receiver_id, 2) : null;
      const liftUuid = resolveLiftUuid(job.lift_id);
      const fromFloorUuid = resolveFloorUuid(job.from_floor);
      const toFloorUuid = resolveFloorUuid(job.to_floor);

      // Parse floor number (1..4)
      const srcNum = typeof job.from_floor === 'number'
        ? job.from_floor
        : parseInt(String(job.from_floor || '').replace(/[^0-9]/g, ''), 10) || 1;
      const dstNum = typeof job.to_floor === 'number'
        ? job.to_floor
        : parseInt(String(job.to_floor || '').replace(/[^0-9]/g, ''), 10) || 2;

      const jobNo = job.job_no || `TR-${Math.floor(1000 + Math.random() * 9000)}`;
      const nowIso = new Date().toISOString();
      const statusStr = job.status || 'CREATED';
      const remarkStr = job.remark || null;

      const newJob: DbTransportJob = {
        id: crypto.randomUUID(),
        created_at: nowIso,
        job_no: jobNo,
        lift_id: liftUuid,
        from_floor: fromFloorUuid,
        to_floor: toFloorUuid,
        sender_id: senderUuid,
        receiver_id: receiverUuid,
        status: statusStr,
        remark: remarkStr
      };

      // 1. Luôn lưu vào Local Storage ngay lập tức để không bao giờ bị mất dữ liệu
      const localExists = mockDbData.transportJobs.some(j => j.id === newJob.id || j.job_no === newJob.job_no);
      if (!localExists) {
        mockDbData.transportJobs.unshift(newJob);
        saveMockData();
      }

      // 2. Lưu vào Supabase với chuỗi biến thể payload tự thích ứng (Adaptive Multi-Attempt)
      // Chú ý: KHÔNG gửi `id` để PostgreSQL tự sinh ID (dù id là BIGSERIAL hay UUID gen_random_uuid())
      if (isSupabaseConfigured()) {
        const supabase = getSupabase();

        // Lấy ID thực tế từ database nếu có
        let validLiftId: string | null = cachedLifts[0]?.id || null;
        let validFloorId: string | null = cachedFloors[0]?.id || null;
        let validUserId: string | null = cachedUsers[0]?.id || null;

        // Sử dụng cache thiết bị nếu có, không query database tránh lãng phí request
        if (!validLiftId && mockDbData.lifts?.length > 0) validLiftId = mockDbData.lifts[0].id;
        if (!validFloorId && mockDbData.floors?.length > 0) validFloorId = mockDbData.floors[0].id;
        if (!validUserId && mockDbData.users?.length > 0) validUserId = mockDbData.users[0].id;

        const candidatePayloads: Record<string, any>[] = [
          // Lượt 0: Truyền ID UUID đã sinh từ client (phòng trường hợp DB thiếu DEFAULT gen_random_uuid)
          {
            id: newJob.id,
            job_no: jobNo,
            lift_id: liftUuid,
            from_floor: fromFloorUuid,
            to_floor: toFloorUuid,
            sender_id: senderUuid,
            receiver_id: receiverUuid,
            status: statusStr,
            remark: remarkStr,
            created_at: nowIso
          },
          // Lượt 1: Schema chuẩn UUID (KHÔNG truyền id để tránh lỗi bigint/uuid)
          {
            job_no: jobNo,
            lift_id: liftUuid,
            from_floor: fromFloorUuid,
            to_floor: toFloorUuid,
            sender_id: senderUuid,
            receiver_id: receiverUuid,
            status: statusStr,
            remark: remarkStr,
            created_at: nowIso
          },
          // Lượt 2: Bỏ FK user sender_id / receiver_id (vượt qua lỗi 23503 users)
          {
            job_no: jobNo,
            lift_id: liftUuid,
            from_floor: fromFloorUuid,
            to_floor: toFloorUuid,
            status: statusStr,
            remark: remarkStr,
            created_at: nowIso
          },
          // Lượt 3: Sử dụng ID thực tế trực tiếp từ DB cho lift_id và floor
          ...(validLiftId && validFloorId ? [{
            job_no: jobNo,
            lift_id: validLiftId,
            from_floor: validFloorId,
            to_floor: validFloorId,
            status: statusStr,
            remark: remarkStr,
            created_at: nowIso
          }] : []),
          // Lượt 4: Schema dùng tầng số nguyên int4 (1, 2) và lift_id string ('L1')
          {
            job_no: jobNo,
            lift_id: String(job.lift_id || 'L1'),
            from_floor: srcNum,
            to_floor: dstNum,
            status: statusStr,
            remark: remarkStr,
            created_at: nowIso
          },
          // Lượt 5: Schema dùng created_by thay vì sender_id, và notes thay vì remark
          {
            job_no: jobNo,
            lift_id: validLiftId || String(job.lift_id || 'L1'),
            from_floor: validFloorId || srcNum,
            to_floor: validFloorId || dstNum,
            created_by: validUserId || null,
            status: statusStr,
            notes: remarkStr,
            created_at: nowIso
          },
          // Lượt 6: Siêu tối giản (chỉ các cột cơ bản nhất)
          {
            job_no: jobNo,
            status: statusStr,
            remark: remarkStr,
            created_at: nowIso
          }
        ];

        let savedData: any = null;
        for (let i = 0; i < candidatePayloads.length; i++) {
          const payload = candidatePayloads[i];
          try {
            let { data, error } = await supabase.from('transport_jobs').insert([payload]).select().single();
            
            // Xử lý LỖI 4: duplicate key value violates unique constraint "transport_jobs_job_no_key"
            if (error && (error.code === '23505' || error.message.includes('job_no_key') || error.message.includes('unique constraint'))) {
              const freshJobNo = `TR-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
              console.warn(`⚠️ [Supabase transport_jobs] Trùng mã đơn ${payload.job_no}, tự sinh mã mới ${freshJobNo} và thử lại...`);
              payload.job_no = freshJobNo;
              newJob.job_no = freshJobNo;
              const retryUnique = await supabase.from('transport_jobs').insert([payload]).select().single();
              data = retryUnique.data;
              error = retryUnique.error;
            }

            if (!error && data) {
              console.log(`✅ [Supabase transport_jobs] Đã lưu thành công đơn #${payload.job_no} ở lượt thử ${i + 1}:`, data);
              savedData = data;
              break;
            } else if (error) {
              console.warn(`[Supabase transport_jobs] Lượt thử ${i + 1} gặp lỗi:`, error.message, error.code);
            }
          } catch (e) {
            console.warn(`[Supabase transport_jobs] Exception lượt thử ${i + 1}:`, e);
          }
        }

        if (savedData) {
          const finalJob = { ...newJob, ...savedData, id: savedData.id || newJob.id };
          const idx = mockDbData.transportJobs.findIndex(j => j.id === newJob.id || j.job_no === newJob.job_no);
          if (idx !== -1) mockDbData.transportJobs[idx] = finalJob;
          saveMockData();
          return finalJob;
        } else {
          console.error(`❌ [Supabase transport_jobs] Tất cả ${candidatePayloads.length} lượt thử lưu đều không thành công. Đơn hàng được giữ an toàn trong Local Storage.`);
        }
      }

      if (isGoogleSheetConfigured()) {
        googleSheetClient.postAction('createJob', newJob).catch(console.error);
      }

      return newJob;
    },

    async update(id: string, updates: Partial<DbTransportJob>): Promise<boolean> {
      const cleanUpdates: Partial<DbTransportJob> = { ...updates };
      if (cleanUpdates.lift_id) cleanUpdates.lift_id = resolveLiftUuid(cleanUpdates.lift_id);
      if (cleanUpdates.from_floor) cleanUpdates.from_floor = resolveFloorUuid(cleanUpdates.from_floor);
      if (cleanUpdates.to_floor) cleanUpdates.to_floor = resolveFloorUuid(cleanUpdates.to_floor);
      if (cleanUpdates.sender_id) cleanUpdates.sender_id = resolveUserUuid(cleanUpdates.sender_id);
      if (cleanUpdates.receiver_id) cleanUpdates.receiver_id = resolveUserUuid(cleanUpdates.receiver_id);

      // Tự động gắn mốc thời gian hoàn tất nếu chuyển sang COMPLETED
      if (cleanUpdates.status === 'COMPLETED' && !cleanUpdates.completed_at) {
        cleanUpdates.completed_at = new Date().toISOString();
      }

      if (isSupabaseConfigured()) {
        try {
          let query = getSupabase().from('transport_jobs').update(cleanUpdates);
          if (isUuid(id)) {
            query = query.eq('id', id);
          } else {
            query = query.eq('job_no', id);
          }
          const { error } = await query;
          if (error) {
            console.warn('Supabase error updating transport_job:', error.message);
          }
        } catch (e) {
          console.warn('Supabase exception updating transport_job:', e);
        }
      }

      const idx = mockDbData.transportJobs.findIndex(j => j.id === id || j.job_no === id);
      if (idx !== -1) {
        mockDbData.transportJobs[idx] = { ...mockDbData.transportJobs[idx], ...cleanUpdates };
        saveMockData();
        if (isGoogleSheetConfigured()) {
          googleSheetClient.postAction('updateJob', { id, ...cleanUpdates }).catch(console.error);
        }
        return true;
      }
      return false;
    }
  },

  // 11. Job Timeline
  jobTimeline: {
    async getByJobId(jobId: string): Promise<DbJobTimeline[]> {
      if (!isSupabaseConfigured()) return mockDbData.jobTimeline.filter(t => t.job_id === jobId);
      try {
        const { data } = await getSupabase().from('job_timeline').select('*').eq('job_id', jobId).order('action_time', { ascending: true });
        return data || [];
      } catch {
        return [];
      }
    },
    async create(timelineItem: Omit<DbJobTimeline, 'id' | 'action_time'>): Promise<DbJobTimeline> {
      let resolvedJobIdVal: any = null;
      if (typeof timelineItem.job_id === 'number') {
        resolvedJobIdVal = timelineItem.job_id;
      } else if (typeof timelineItem.job_id === 'string' && /^\d+$/.test(timelineItem.job_id)) {
        resolvedJobIdVal = parseInt(timelineItem.job_id, 10);
      } else if (isUuid(timelineItem.job_id)) {
        resolvedJobIdVal = timelineItem.job_id;
      }

      const newItem: DbJobTimeline = {
        id: crypto.randomUUID(),
        action_time: new Date().toISOString(),
        job_id: resolvedJobIdVal || timelineItem.job_id,
        status: timelineItem.status || 'UPDATED',
        action_by: resolveUserUuid(timelineItem.action_by),
        remark: timelineItem.remark || null
      };

      // Lưu vào bộ nhớ đệm thiết bị (localStorage), không gọi API Supabase tránh lãng phí request
      mockDbData.jobTimeline.push(newItem);
      saveMockData();
      return newItem;
    }
  },

  // 12. Telegram Logs
  telegramLogs: {
    async getAll(): Promise<DbTelegramLog[]> {
      if (!isSupabaseConfigured()) return mockDbData.telegramLogs;
      const { data } = await getSupabase().from('telegram_logs').select('*').order('sent_time', { ascending: false });
      return data || [];
    },
    async log(logItem: Omit<DbTelegramLog, 'id' | 'sent_time'>): Promise<DbTelegramLog> {
      const resolvedUser = logItem.user_id ? resolveUserUuid(logItem.user_id) : null;
      const newLog: DbTelegramLog = {
        id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
        sent_time: new Date().toISOString(),
        ...logItem,
        job_id: isUuid(logItem.job_id) ? logItem.job_id : null,
        user_id: resolvedUser && isUuid(resolvedUser) ? resolvedUser : null
      };
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await getSupabase().from('telegram_logs').insert([newLog]).select().single();
          if (data) {
            mockDbData.telegramLogs.unshift(data);
            saveMockData();
            return data;
          } else if (error) {
            console.warn('Supabase telegram_logs insert warning:', error.message);
            if (error.message.includes('foreign key') || error.code === '23503') {
              const fallbackLog = { ...newLog, user_id: null, job_id: null };
              const { data: retryData } = await getSupabase().from('telegram_logs').insert([fallbackLog]).select().single();
              if (retryData) {
                mockDbData.telegramLogs.unshift(retryData);
                saveMockData();
                return retryData;
              }
            }
          }
        } catch (e) {
          console.warn('Supabase exception creating telegram_log:', e);
        }
      }
      mockDbData.telegramLogs.unshift(newLog);
      saveMockData();
      return newLog;
    },
    async clear(): Promise<boolean> {
      if (isSupabaseConfigured()) {
        const { error } = await getSupabase().from('telegram_logs').delete().gte('id', 0);
        if (error) console.warn('Supabase clear telegram_logs error:', error.message);
      }
      mockDbData.telegramLogs = [];
      saveMockData();
      return true;
    }
  },

  // 13. Activity Logs
  activityLogs: {
    async getAll(): Promise<DbActivityLog[]> {
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await getSupabase()
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(60);
          if (!error && data) {
            return data;
          } else if (error) {
            console.warn('Supabase activity_logs fetch warning:', error.message);
          }
        } catch (e) {
          console.warn('Exception fetching activity_logs from Supabase:', e);
        }
      }

      return mockDbData.activityLogs;
    },
    async add(activity: Omit<DbActivityLog, 'id' | 'created_at'>): Promise<DbActivityLog> {
      let resolvedUserId = activity.user_id ? (isUuid(activity.user_id) ? activity.user_id : resolveUserUuid(activity.user_id)) : null;
      if (resolvedUserId && cachedUsers.length > 0 && !cachedUsers.some(u => u.id === resolvedUserId)) {
        resolvedUserId = cachedUsers[0]?.id || null;
      }

      // Safe record_id: hỗ trợ cả bigint ID và UUID ID, tránh lỗi 22P02 bigint syntax
      let safeRecordId: any = null;
      if (activity.record_id !== undefined && activity.record_id !== null) {
        const recStr = String(activity.record_id).trim();
        if (/^\d+$/.test(recStr)) {
          safeRecordId = parseInt(recStr, 10);
        } else if (isUuid(recStr)) {
          safeRecordId = recStr;
        }
      }

      const newActivity: DbActivityLog = {
        id: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000),
        created_at: new Date().toISOString(),
        ...activity,
        user_id: resolvedUserId,
        record_id: activity.record_id ? String(activity.record_id) : null
      };

      if (isSupabaseConfigured()) {
        try {
          const payload: any = {
            user_id: resolvedUserId,
            action: newActivity.action,
            table_name: newActivity.table_name,
            description: newActivity.description,
            event_type: newActivity.event_type || 'SYSTEM_EVENT'
          };
          if (safeRecordId !== null) {
            payload.record_id = safeRecordId;
          }

          const { data, error } = await getSupabase().from('activity_logs').insert([payload]).select().single();

          if (!error && data) {
            const finalAct = { ...newActivity, ...data, id: data.id || newActivity.id };
            mockDbData.activityLogs.unshift(finalAct);
            saveMockData();
            return data;
          } else if (error) {
            console.warn('Supabase error creating activity_log (attempt 1):', error.message);
            // Universal retry with user_id: null & record_id: null if FK or column constraint failed
            const { data: retryData, error: retryErr } = await getSupabase().from('activity_logs').insert([{
              user_id: null,
              action: newActivity.action,
              table_name: newActivity.table_name,
              record_id: null,
              description: newActivity.description,
              event_type: newActivity.event_type || 'SYSTEM_EVENT'
            }]).select().single();
            if (!retryErr && retryData) {
              mockDbData.activityLogs.unshift(retryData);
              saveMockData();
              return retryData;
            }
          }
        } catch (e) {
          console.warn('Supabase exception creating activity_log:', e);
        }
      }

      mockDbData.activityLogs.unshift(newActivity);
      saveMockData();
      if (isGoogleSheetConfigured()) {
        googleSheetClient.postAction('createLog', newActivity).catch(console.error);
      }
      return newActivity;
    }
  },

  // 14. System Settings
  systemSettings: {
    async getAll(): Promise<DbSystemSetting[]> {
      if (!isSupabaseConfigured()) return mockDbData.systemSettings;
      const { data } = await getSupabase().from('system_settings').select('*');
      return data || [];
    },
    async updateSetting(key: string, value: string): Promise<boolean> {
      if (isSupabaseConfigured()) {
        const { error } = await getSupabase().from('system_settings').upsert({
          setting_key: key,
          setting_value: value,
          updated_at: new Date().toISOString()
        }, { onConflict: 'setting_key' });
        if (!error) {
          const idx = mockDbData.systemSettings.findIndex(s => s.setting_key === key);
          if (idx !== -1) {
            mockDbData.systemSettings[idx].setting_value = value;
            mockDbData.systemSettings[idx].updated_at = new Date().toISOString();
          } else {
            mockDbData.systemSettings.push({
              id: Date.now(),
              setting_group: 'SYSTEM',
              setting_key: key,
              setting_value: value,
              value_type: 'STRING',
              description: `Cấu hình ${key}`,
              updated_at: new Date().toISOString(),
              updated_by: 'u1'
            });
          }
          saveMockData();
          return true;
        }
      }
      const idx = mockDbData.systemSettings.findIndex(s => s.setting_key === key);
      if (idx !== -1) {
        mockDbData.systemSettings[idx].setting_value = value;
        mockDbData.systemSettings[idx].updated_at = new Date().toISOString();
      } else {
        mockDbData.systemSettings.push({
          id: Date.now(),
          setting_group: 'SYSTEM',
          setting_key: key,
          setting_value: value,
          value_type: 'STRING',
          description: `Cấu hình ${key}`,
          updated_at: new Date().toISOString(),
          updated_by: 'u1'
        });
      }
      saveMockData();
      return true;
    }
  },

  // 15. Notifications
  notifications: {
    async getAll(): Promise<DbNotification[]> {
      if (!isSupabaseConfigured()) return mockDbData.notifications;
      const { data, error } = await getSupabase()
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data || [];
    },
    async create(notification: Omit<DbNotification, 'id' | 'created_at'>): Promise<DbNotification> {
      // 1. Xác định job_id an toàn (hỗ trợ cả bigint ID và UUID, giải quyết LỖI 2 và LỖI 3)
      let resolvedJobId: any = null;
      if (notification.job_id !== undefined && notification.job_id !== null) {
        const jIdStr = String(notification.job_id).trim();
        if (/^\d+$/.test(jIdStr)) {
          resolvedJobId = parseInt(jIdStr, 10);
        } else if (isUuid(jIdStr)) {
          resolvedJobId = jIdStr;
        }
      }

      const clientUuid = crypto.randomUUID();
      const newNotif: DbNotification = {
        id: clientUuid,
        created_at: new Date().toISOString(),
        job_id: resolvedJobId ? String(resolvedJobId) : null,
        receiver_id: resolveUserUuid(notification.receiver_id),
        notification_type: notification.notification_type || 'INFO',
        title: notification.title || '',
        message: notification.message || '',
        status: notification.status || 'SENT'
      };

      if (isSupabaseConfigured()) {
        try {
          // Lần 1: Không gửi cột 'id' (để PostgreSQL tự sinh nếu id là bigint/BIGSERIAL hoặc gen_random_uuid)
          const basePayload: any = {
            receiver_id: newNotif.receiver_id,
            notification_type: newNotif.notification_type,
            title: newNotif.title,
            message: newNotif.message,
            status: newNotif.status,
            created_at: newNotif.created_at
          };
          if (resolvedJobId !== null) {
            basePayload.job_id = resolvedJobId;
          }

          let { data, error } = await getSupabase().from('notifications').insert([basePayload]).select().single();

          // Lần 2: Xử lý LỖI 2 (notifications_job_id_fkey) hoặc LỖI 3 (invalid input syntax for type bigint)
          if (error && (error.code === '23503' || error.code === '22P02' || error.message.includes('job_id') || error.message.includes('foreign key') || error.message.includes('bigint'))) {
            console.warn('⚠️ [Supabase notifications] FK hoặc bigint mismatch, retry với job_id: null:', error.message);
            const retryPayload = { ...basePayload, job_id: null };
            const retryRes = await getSupabase().from('notifications').insert([retryPayload]).select().single();
            data = retryRes.data;
            error = retryRes.error;
          }

          // Lần 3: Nếu bảng yêu cầu id do client cung cấp (cột id NOT NULL không có default)
          if (error && (error.code === '23502' || error.message.includes('null value in column "id"'))) {
            const uuidPayload = { ...basePayload, id: clientUuid, job_id: null };
            const retryUuid = await getSupabase().from('notifications').insert([uuidPayload]).select().single();
            data = retryUuid.data;
            error = retryUuid.error;
          }

          if (!error && data) {
            mockDbData.notifications.unshift(data);
            saveMockData();
            return data;
          } else if (error) {
            console.warn('Supabase error creating notification:', error.message);
          }
        } catch (e) {
          console.warn('Supabase exception creating notification:', e);
        }
      }

      mockDbData.notifications.unshift(newNotif);
      saveMockData();
      if (isGoogleSheetConfigured()) {
        googleSheetClient.postAction('createNotification', newNotif).catch(console.error);
      }
      return newNotif;
    },
    async updateStatus(id: string, status: string): Promise<boolean> {
      if (isSupabaseConfigured()) {
        const { error } = await getSupabase().from('notifications').update({ status }).eq('id', id);
        if (!error) {
          const idx = mockDbData.notifications.findIndex(n => n.id === id);
          if (idx !== -1) mockDbData.notifications[idx].status = status;
          saveMockData();
          return true;
        }
      }
      const idx = mockDbData.notifications.findIndex(n => n.id === id);
      if (idx !== -1) {
        mockDbData.notifications[idx].status = status;
        saveMockData();
        return true;
      }
      return false;
    }
  }
};

// Initial database seed data structured explicitly according to the 15 database table schemas
const initialMockDbData = {
  roles: [
    { id: 1, role_name: 'Admin', description: 'Quản trị viên toàn quyền hệ thống kho', created_at: '2026-01-01T00:00:00Z' },
    { id: 2, role_name: 'Supervisor', description: 'Quản lý các Thang tời ở các tầng', created_at: '2026-01-01T00:00:00Z' },
    { id: 3, role_name: 'Worker', description: 'Nhân viên vận hành dỡ trả tải trọng', created_at: '2026-01-01T00:00:00Z' },
  ] as DbRole[],

  floors: [
    { id: 'f1', floor_no: 1, floor_name: 'Tầng 1 - Kho Nhận & Xuất Hàng', created_at: '2026-01-01T00:00:00Z' },
    { id: 'f2', floor_no: 2, floor_name: 'Tầng 2 - Kho Linh Kiện A', created_at: '2026-01-01T00:00:00Z' },
    { id: 'f3', floor_no: 3, floor_name: 'Tầng 3 - Kho Thành Phẩm B', created_at: '2026-01-01T00:00:00Z' },
    { id: 'f4', floor_no: 4, floor_name: 'Tầng 4 - Xưởng Gia Công & Đóng Gói', created_at: '2026-01-01T00:00:00Z' },
  ] as DbFloor[],

  users: [
    {
      id: 'u1',
      employee_code: 'NV-001',
      full_name: 'Nguyễn Văn Hùng',
      telegram_id: '689230129',
      phone: '0988123456',
      role_id: 1,
      floor_id: 'f1',
      active: true,
      created_at: '2026-01-15T08:00:00Z',
      password: '123456'
    },
    {
      id: 'u2',
      employee_code: 'NV-002',
      full_name: 'Trần Văn Hải',
      telegram_id: '689230130',
      phone: '0977234567',
      role_id: 2,
      floor_id: 'f2',
      active: true,
      created_at: '2026-01-16T08:00:00Z',
      password: '123456'
    },
    {
      id: 'u3',
      employee_code: 'NV-003',
      full_name: 'Phạm Lan Trang',
      telegram_id: '689230131',
      phone: '0966345678',
      role_id: 3,
      floor_id: 'f4',
      active: true,
      created_at: '2026-01-17T08:00:00Z',
      password: '123456'
    },
    {
      id: 'u4',
      employee_code: 'NV-004',
      full_name: 'Đặng Anh Lực',
      telegram_id: '689230132',
      phone: '0955456789',
      role_id: 3,
      floor_id: 'f1',
      active: true,
      created_at: '2026-01-18T08:00:00Z',
      password: '123456'
    }
  ] as DbUser[],

  userDevices: [
    {
      id: 'd1',
      user_id: 'u1',
      device_name: 'Samsung Galaxy Tab A8',
      device_type: 'TABLET',
      browser: 'Chrome Mobile 122',
      push_token: 'push_token_abc123',
      last_login: new Date().toISOString(),
      active: true
    }
  ] as DbUserDevice[],

  liftStatus: [
    { id: 1, status_code: 'AVAILABLE', status_name: 'Sẵn Sàng', color: '#10B981' },
    { id: 2, status_code: 'MOVING', status_name: 'Đang Di Chuyển', color: '#3B82F6' },
    { id: 3, status_code: 'WAITING_PICKUP', status_name: 'Chờ Dỡ Hàng', color: '#F59E0B' },
    { id: 4, status_code: 'LOCKED', status_name: 'Khóa Tầng', color: '#8B5CF6' },
    { id: 5, status_code: 'MAINTENANCE', status_name: 'Bảo Trì Định Kỳ', color: '#EF4444' },
    { id: 6, status_code: 'OFFLINE', status_name: 'Mat Ket Noi', color: '#6B7280' },
  ] as DbLiftStatus[],

  lifts: [
    {
      id: 'L1',
      lift_code: 'LIFT-01',
      lift_name: 'Lift 01',
      current_floor: 'f1',
      status_id: 1,
      has_cargo: false,
      current_job: null,
      last_update: new Date().toISOString(),
      note: 'Vận hành tốt',
      lock_type: 'NONE'
    },
    {
      id: 'L2',
      lift_code: 'LIFT-02',
      lift_name: 'Lift 02',
      current_floor: 'f3',
      status_id: 2,
      has_cargo: true,
      current_job: 'j2',
      last_update: new Date().toISOString(),
      note: 'Đang chạy từ T3 xuống T1',
      lock_type: 'NONE'
    },
    {
      id: 'L3',
      lift_code: 'LIFT-03',
      lift_name: 'Lift 03',
      current_floor: 'f4',
      status_id: 3,
      has_cargo: true,
      current_job: 'j4',
      last_update: new Date(Date.now() - 120000).toISOString(),
      pickup_start_time: Date.now() - 120000,
      note: 'Tồn hàng chờ dỡ tại Tầng 4 quá 2 phút',
      lock_type: 'NONE'
    },
    {
      id: 'L4',
      lift_code: 'LIFT-04',
      lift_name: 'Lift 04',
      current_floor: 'f2',
      status_id: 4,
      has_cargo: false,
      current_job: null,
      last_update: new Date().toISOString(),
      note: 'Đã khóa điều hướng riêng cho T2',
      lock_type: 'FLOOR_LOCK'
    },
    {
      id: 'L5',
      lift_code: 'LIFT-05',
      lift_name: 'Lift 05',
      current_floor: 'f1',
      status_id: 5,
      has_cargo: false,
      current_job: null,
      last_update: new Date().toISOString(),
      note: 'Bảo trì định kỳ hệ thống cáp kéo',
      lock_type: 'MAINTENANCE'
    },
    {
      id: 'L6',
      lift_code: 'LIFT-06',
      lift_name: 'Lift 06',
      current_floor: 'f4',
      status_id: 2,
      has_cargo: true,
      current_job: 'j1',
      last_update: new Date().toISOString(),
      note: 'Đang chở 12 thùng linh kiện hỏa tốc',
      lock_type: 'NONE'
    }
  ] as DbLift[],

  liftCommands: [
    {
      id: 'cmd-1',
      lift_id: 'L1',
      command: 'MOVE_TO_FLOOR',
      payload: { floor_no: 4 },
      status: 'EXECUTED',
      created_by: 'u1',
      created_at: new Date(Date.now() - 10 * 60000).toISOString(),
      executed_at: new Date(Date.now() - 9 * 60000).toISOString()
    }
  ] as DbLiftCommand[],

  liftReservations: [
    {
      id: 'res-1',
      lift_id: 'L3',
      from_floor_id: 'f1',
      to_floor_id: 'f4',
      reserved_by: 'u3',
      start_time: new Date(Date.now() - 45 * 60000).toISOString(),
      end_time: new Date(Date.now() + 15 * 60000).toISOString(),
      reason: 'Đặt tời vận chuyển vật tư xưởng Tầng 4',
      active: true,
      created_at: new Date(Date.now() - 50 * 60000).toISOString()
    }
  ] as DbLiftReservation[],

  dailyAssignments: [
    {
      id: 'asg-1',
      work_date: new Date().toISOString().split('T')[0],
      user_id: 'u4',
      floor_id: 'f1',
      lift_id: 'L1',
      shift: 'CA_SANG',
      created_at: new Date().toISOString()
    },
    {
      id: 'asg-2',
      work_date: new Date().toISOString().split('T')[0],
      user_id: 'u3',
      floor_id: 'f4',
      lift_id: 'L3',
      shift: 'CA_SANG',
      created_at: new Date().toISOString()
    }
  ] as DbDailyAssignment[],

  transportJobs: [
    {
      id: 'j1',
      job_no: 'TR-8994',
      lift_id: 'L6',
      from_floor: 'f1',
      to_floor: 'f4',
      sender_id: 'u1',
      receiver_id: 'u3',
      status: 'MOVING',
      created_at: new Date(Date.now() - 5 * 60000).toISOString(),
      moving_at: new Date(Date.now() - 2 * 60000).toISOString(),
      remark: 'Đơn hỏa tốc - 12 thùng linh kiện K2'
    },
    {
      id: 'j2',
      job_no: 'TR-8992',
      lift_id: 'L2',
      from_floor: 'f3',
      to_floor: 'f1',
      sender_id: 'u2',
      receiver_id: 'u4',
      status: 'MOVING',
      created_at: new Date(Date.now() - 20 * 60000).toISOString(),
      moving_at: new Date(Date.now() - 5 * 60000).toISOString(),
      remark: '25 thùng bao bì xuất khẩu'
    },
    {
      id: 'j4',
      job_no: 'TR-8990',
      lift_id: 'L3',
      from_floor: 'f1',
      to_floor: 'f4',
      sender_id: 'u1',
      receiver_id: 'u3',
      status: 'ARRIVED',
      created_at: new Date(Date.now() - 35 * 60000).toISOString(),
      arrived_at: new Date(Date.now() - 4 * 60000).toISOString(),
      remark: 'Chờ lấy quá 4 phút 30 giây'
    }
  ] as DbTransportJob[],

  jobTimeline: [
    {
      id: 't1',
      job_id: 'j1',
      status: 'CREATED',
      action_by: 'u1',
      action_time: new Date(Date.now() - 5 * 60000).toISOString(),
      remark: 'Khởi tạo đơn vận chuyển'
    },
    {
      id: 't2',
      job_id: 'j1',
      status: 'MOVING',
      action_by: 'u1',
      action_time: new Date(Date.now() - 2 * 60000).toISOString(),
      remark: 'Tời 06 chuyển sang trạng thái di chuyển'
    }
  ] as DbJobTimeline[],

  telegramLogs: [
    {
      id: 101,
      job_id: 'j4',
      user_id: 'u1',
      telegram_chat_id: '-1002145892305',
      message: '🚨 CẢNH BÁO TỒN ĐỌNG HÀNG: Tời 03 tại Tầng 4 chờ dỡ quá 4m30s',
      status: 'SUCCESS',
      sent_time: new Date(Date.now() - 4 * 60000).toISOString()
    }
  ] as DbTelegramLog[],

  activityLogs: [
    {
      id: 201,
      user_id: 'u1',
      action: 'CREATE_JOB',
      table_name: 'transport_jobs',
      record_id: 'j1',
      description: 'Nguyễn Văn Hùng đã tạo đơn hỏa tốc #TR-8994',
      created_at: new Date(Date.now() - 5 * 60000).toISOString(),
      event_type: 'JOB_EVENT'
    }
  ] as DbActivityLog[],

  systemSettings: [
    {
      id: 1,
      setting_group: 'TELEGRAM',
      setting_key: 'BOT_TOKEN',
      setting_value: '7829103845:AAHqK8x9pLzM2_W0rT1vU3yZ_wlds',
      value_type: 'STRING',
      description: 'HTTP API Token kết nối Telegram Bot',
      updated_at: new Date().toISOString(),
      updated_by: 'u1'
    },
    {
      id: 2,
      setting_group: 'LIFT_RULES',
      setting_key: 'UNCOLLECTED_WARNING_TIMEOUT_SEC',
      setting_value: '120',
      value_type: 'NUMBER',
      description: 'Thời gian chờ dỡ hàng tối đa trước khi bắn chuông Telegram (giây)',
      updated_at: new Date().toISOString(),
      updated_by: 'u1'
    }
  ] as DbSystemSetting[],

  notifications: [
    {
      id: 'notif-1',
      job_id: 'j4',
      notification_type: 'UNCOLLECTED_CARGO_WARNING',
      receiver_id: 'u3',
      title: '🚨 Cảnh Báo Tồn Đọng Tời 03',
      message: 'Hàng hóa tại Tầng 4 trên Tời 03 chưa được dỡ xuống quá 4 phút 30 giây.',
      status: 'SENT',
      created_at: new Date(Date.now() - 4 * 60000).toISOString(),
      sent_at: new Date(Date.now() - 4 * 60000).toISOString()
    },
    {
      id: 'notif-2',
      job_id: 'j1',
      notification_type: 'JOB_ARRIVED',
      receiver_id: 'u3',
      title: '📦 Đơn Tời Đang Đến Tầng 4',
      message: 'Đơn hàng #TR-8994 (12 thùng linh kiện K2) đang chuyển đến Tầng 4.',
      status: 'READ',
      created_at: new Date(Date.now() - 2 * 60000).toISOString(),
      sent_at: new Date(Date.now() - 2 * 60000).toISOString()
    }
  ] as DbNotification[]
};

const DB_STORAGE_KEY = 'liftflow_db_store_v2';

const loadMockDbData = (): typeof initialMockDbData => {
  try {
    const saved = localStorage.getItem(DB_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return { ...initialMockDbData, ...parsed };
      }
    }
  } catch (e) {
    console.warn('Could not load stored database data:', e);
  }
  return initialMockDbData;
};

export const mockDbData = loadMockDbData();

export const saveMockData = () => {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(mockDbData));
  } catch (e) {
    console.warn('Could not save database state to localStorage:', e);
  }
};

