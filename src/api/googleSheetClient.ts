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
      const res = await fetch(GOOGLE_SHEET_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, payload }),
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
