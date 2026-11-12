import { GOOGLE_SHEET_API_URL, isGoogleSheetConfigured } from '../config/sheetConfig';
import { 
  DbUser, DbLift, DbTransportJob, DbDailyAssignment, 
  DbNotification, DbActivityLog, DbSystemSetting 
} from '../types/database';

export interface GoogleSheetAllData {
  users: DbUser[];
  lifts: DbLift[];
  transportJobs: DbTransportJob[];
  dailyAssignments: DbDailyAssignment[];
  notifications: DbNotification[];
  activityLogs: DbActivityLog[];
  systemSettings: DbSystemSetting[];
}

/**
 * Chuẩn hóa giá trị ghi vào Google Sheets để không bị mất các số 0 ở đầu (ví dụ: '00334' -> "'00334").
 * Trong Google Sheets / Excel, dấu nháy đơn (') ở đầu buộc bảng tính lưu dạng Text (Plain Text),
 * hiển thị chính xác '00334' trên giao diện bảng tính mà không bị chuyển thành số '334'.
 */
export const formatSheetTextValue = (val: any): any => {
  if (val === null || val === undefined) return val;
  const str = String(val).trim();
  if (!str) return '';
  if (str.startsWith("'")) return str;
  // Bất kỳ chuỗi nào gồm toàn chữ số (đặc biệt có số 0 ở đầu như "00334" hoặc mã số nhân viên "334")
  // đều được thêm dấu ' để Google Sheets không ép kiểu thành số (Number) làm mất các số 0 ở đầu
  if (/^0\d+$/.test(str) || /^\d+$/.test(str)) {
    return `'${str}`;
  }
  return str;
};

/**
 * Xử lý toàn bộ payload trước khi gửi POST lên Google Apps Script Web App
 */
export const sanitizePayloadForSheet = (action: string, payload: any): any => {
  if (!payload || typeof payload !== 'object') return payload;
  const copy = { ...payload };

  // Các trường ID người dùng / mã nhân viên cần bảo toàn số 0 ở đầu
  // 1. Sheet TransportJobs: sender_id, receiver_id
  // 2. Sheet Notifications: receiver_id
  // 3. Sheet ActivityLogs: user_id, record_id
  // 4. Sheet DailyAssignments: user_id
  // 5. Sheet Users: id, employee_code
  const targetIdFields = [
    'sender_id',
    'receiver_id',
    'user_id',
    'employee_code',
    'user_code'
  ];

  targetIdFields.forEach(field => {
    if (copy[field] !== undefined && copy[field] !== null) {
      const s = String(copy[field]).trim();
      if (s) {
        copy[field] = s.startsWith("'") ? s : `'${s.replace(/^'/, '')}`;
      }
    }
  });

  if ((action === 'createUser' || action === 'updateUser') && copy.id) {
    const s = String(copy.id).trim();
    if (s) {
      copy.id = s.startsWith("'") ? s : `'${s.replace(/^'/, '')}`;
    }
  }

  if (action === 'createLog' && copy.record_id) {
    const s = String(copy.record_id).trim();
    if (s && (/^0\d+$/.test(s) || /^\d+$/.test(s))) {
      copy.record_id = s.startsWith("'") ? s : `'${s.replace(/^'/, '')}`;
    }
  }

  // Quét bất kỳ giá trị string nào bắt đầu bằng '0' theo sau là các chữ số (ví dụ: '00334', '012')
  for (const key of Object.keys(copy)) {
    if (typeof copy[key] === 'string') {
      const trimmed = copy[key].trim();
      if (/^0\d+$/.test(trimmed) && !trimmed.startsWith("'")) {
        copy[key] = `'${trimmed}`;
      }
    }
  }

  return copy;
};

/**
 * Xóa dấu nháy đơn (') do Google Sheets lưu dạng Text khi đọc về ứng dụng
 */
export const cleanSheetValue = (val: any): any => {
  if (typeof val === 'string') {
    return val.replace(/^'/, '').trim();
  }
  return val;
};

export const googleSheetClient = {
  isConfigured: isGoogleSheetConfigured,

  async fetchAll(): Promise<GoogleSheetAllData | null> {
    if (!isGoogleSheetConfigured()) return null;
    try {
      const res = await fetch(`${GOOGLE_SHEET_API_URL}?action=getAll`, {
        method: 'GET',
        redirect: 'follow',
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json && json.success && json.data) {
        return json.data;
      }
      return null;
    } catch (e) {
      console.warn('[GoogleSheetClient] fetchAll error:', e);
      return null;
    }
  },

  async postAction(action: string, payload: any): Promise<boolean> {
    if (!isGoogleSheetConfigured()) return false;
    try {
      const sanitizedPayload = sanitizePayloadForSheet(action, payload);
      const res = await fetch(GOOGLE_SHEET_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload: sanitizedPayload }),
        redirect: 'follow',
      });
      if (!res.ok) return false;
      const json = await res.json();
      return Boolean(json?.success);
    } catch (e) {
      console.warn(`[GoogleSheetClient] ${action} error:`, e);
      return false;
    }
  }
};
