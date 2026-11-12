import { create } from 'zustand';
import { Lift, Job, AppNotification, ActivityLog } from '../types';
import { db, isUuid } from '../api/dbClient';
import { mockLifts, mockJobs, mockNotifications, mockActivities } from '../data/mock';
import { useAuthStore } from './useAuthStore';
import { speakLiftArrival } from '../utils/audio';
import { isSameLift, safeParseTimestamp, getLocalDateString, getEffectiveAllowedFloors } from '../utils/time';
import { getStoredRestrictionForLift, saveStoredFloorRestriction } from '../utils/floorRestrictions';
import { broadcastLiftArrival } from '../utils/liftBroadcast';
import { markLocalAction } from '../utils/syncLock';

interface LiftState {
  lifts: Lift[];
  jobs: Job[];
  notifications: AppNotification[];
  activities: ActivityLog[];
  isLoading: boolean;
  syncStatus: 'connecting' | 'realtime' | 'polling' | 'offline';
  lastSyncedAt: Date | null;
  setSyncStatus: (status: 'connecting' | 'realtime' | 'polling' | 'offline', syncedAt?: Date) => void;
  updateLift: (liftId: string, updates: Partial<Lift>) => void;
  checkAndResetExpiredRestrictions: () => void;
  updateJob: (jobId: string, updates: Partial<Job>) => void;
  addJob: (jobData: Partial<Job>) => Promise<Job>;
  cancelJob: (jobId: string) => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  addActivity: (activity: Omit<ActivityLog, 'id' | 'created_at'>) => void;
  fetchInitialData: () => Promise<void>;
  fetchDynamicData: (includeLogs?: boolean) => Promise<void>;
  simulateRealtime: () => void;
}

// Module-level caches for static reference data (rarely changed: floors, users, lift_status)
let _cachedStatusList: any[] = [];
let _cachedUsers: any[] = [];
let _cachedFloors: any[] = [];
let _cachedStatusCodeMap: Record<number, string> = {};
let _cachedUserMap: Record<string, string> = {};
let _cachedFloorMap: Record<string, number> = {};

let _isFetchingInitial = false;
let _isFetchingDynamic = false;

const STATIC_CACHE_KEY = 'liftflow_static_metadata_v2';

const loadStaticMetadataCache = (): boolean => {
  try {
    const raw = localStorage.getItem(STATIC_CACHE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.timestamp && Date.now() - data.timestamp < 3600 * 1000) {
        _cachedStatusList = data.statusList || [];
        _cachedUsers = data.users || [];
        _cachedFloors = data.floors || [];
        _cachedStatusCodeMap = data.statusCodeMap || {};
        _cachedUserMap = data.userMap || {};
        _cachedFloorMap = data.floorMap || {};
        return _cachedFloors.length > 0 && _cachedUsers.length > 0;
      }
    }
  } catch (e) {
    console.warn('Could not read static metadata cache:', e);
  }
  return false;
};

// Khởi tạo cache tĩnh từ bộ nhớ đệm thiết bị (localStorage) ngay khi khởi động
loadStaticMetadataCache();

// Helper: parseFloor using floorMap
const parseFloorWithMap = (floor: string | number | null | undefined, floorMap: Record<string, number>): number => {
  if (typeof floor === 'number') return floor;
  if (!floor) return 1;
  const str = String(floor);
  if (floorMap[str]) return floorMap[str];
  if (str.startsWith('f')) {
    const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(num) && num > 0) return num;
  }
  const fallbackNum = parseInt(str.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(fallbackNum) && fallbackNum > 0 && fallbackNum <= 10) return fallbackNum;
  return 1;
};

// Helper: checkSameLift
const checkSameLift = (val1: any, val2: any): boolean => {
  if (!val1 || !val2) return false;
  if (val1 === val2) return true;
  const s1 = String(val1).toLowerCase().trim();
  const s2 = String(val2).toLowerCase().trim();
  if (s1 === s2) return true;
  const num1 = s1.replace(/[^0-9]/g, '');
  const num2 = s2.replace(/[^0-9]/g, '');
  if (num1 && num2 && num1 === num2 && num1.length <= 2) return true;
  return false;
};

// Shared helper: map and merge lifts + jobs
function processLiftsAndJobs(
  dbLifts: any[],
  dbJobs: any[],
  currentLifts: Lift[],
  currentJobs: Job[],
  statusCodeMap: Record<number, string>,
  userMap: Record<string, string>,
  floorMap: Record<string, number>
): { mergedLifts: Lift[]; mappedJobs: Job[] } {
  const mappedLifts: Lift[] = dbLifts.map(d => {
    // Fallback robust active job matching
    const activeJob = (d.current_job
      ? (dbJobs.find(j => j.id === d.current_job || j.job_no === d.current_job || (j as any).code === d.current_job) ||
        currentJobs.find(j => j.id === d.current_job || j.code === d.current_job))
      : null) ||
      dbJobs.find(j =>
        (checkSameLift(j.lift_id, d.id) || checkSameLift(j.lift_id, d.lift_code) || checkSameLift(j.lift_id, d.lift_name)) &&
        ['MOVING', 'WAITING_PICKUP', 'CREATED'].includes(j.status)
      ) ||
      currentJobs.find(j =>
        (checkSameLift(j.lift_id, d.id) || checkSameLift(j.lift_id, d.lift_code) || checkSameLift(j.lift_id, d.lift_name)) &&
        ['MOVING', 'WAITING_PICKUP', 'CREATED'].includes(j.status)
      ) || null;

    const destFloor = activeJob ? parseFloorWithMap((activeJob as any).to_floor || (activeJob as any).target_floor, floorMap) : null;
    const srcFloor = activeJob ? parseFloorWithMap((activeJob as any).from_floor || (activeJob as any).source_floor, floorMap) : null;
    let liftStatus = (statusCodeMap[d.status_id || 1] as any) || 'AVAILABLE';

    // Direct status sync with active job status if active job exists
    if (activeJob && ['MOVING', 'WAITING_PICKUP'].includes((activeJob as any).status)) {
      liftStatus = (activeJob as any).status;
    }

    let pickupStartTime: number | null = null;
    if (liftStatus === 'WAITING_PICKUP') {
      if (d.pickup_start_time) {
        pickupStartTime = safeParseTimestamp(d.pickup_start_time);
      } else if (d.last_update) {
        pickupStartTime = safeParseTimestamp(d.last_update);
      } else {
        pickupStartTime = Date.now();
      }
      const diffMs = Date.now() - pickupStartTime;
      if (diffMs < 0 || diffMs > 2 * 3600 * 1000) {
        pickupStartTime = Date.now();
      }
    }

    // Calculate progress dynamically based on time elapsed
    let computedProgress = 0;
    if (liftStatus === 'MOVING') {
      const startTime = safeParseTimestamp(d.last_update);
      const travelDist = (destFloor && srcFloor) ? Math.abs(destFloor - srcFloor) : 1;
      const totalSecs = travelDist * 20; // 20s per floor
      const elapsedSecs = Math.max(0, (Date.now() - startTime) / 1000);
      const calcProg = Math.floor((elapsedSecs / totalSecs) * 100);
      computedProgress = isNaN(calcProg) ? 0 : Math.min(99, Math.max(0, calcProg));
    } else if (liftStatus === 'WAITING_PICKUP') {
      computedProgress = 100;
    }

    const normalizedLiftId = (d.id && !d.id.includes('-')) ? d.id : (d.lift_code || d.id);

    const storedRestr = getStoredRestrictionForLift(d.id, d.lift_code, d.lift_name);
    const rawAllowed = (d.allowed_floors && d.allowed_floors.length < 4) ? d.allowed_floors : (storedRestr?.allowed_floors || d.allowed_floors || [1, 2, 3, 4]);
    const rawRestrictedByUserId = d.restricted_by_user_id || storedRestr?.restricted_by_user_id || null;
    const rawRestrictedByName = d.restricted_by_name || storedRestr?.restricted_by_name || null;
    const rawRestrictedAt = d.restricted_at || storedRestr?.restricted_at || null;
    const rawRestrictionDate = d.restriction_date || storedRestr?.restriction_date || null;

    const today = getLocalDateString();
    const isExpired = Boolean(rawAllowed && rawAllowed.length < 4 && rawRestrictionDate && rawRestrictionDate !== today);
    const effectiveAllowedFloors = isExpired ? [1, 2, 3, 4] : rawAllowed;

    return {
      id: normalizedLiftId,
      lift_code: d.lift_code || null,
      lift_number: d.lift_name || d.lift_code || d.id,
      current_floor: parseFloorWithMap(d.current_floor, floorMap),
      destination_floor: destFloor,
      source_floor: srcFloor,
      status: liftStatus,
      operator: activeJob ? (activeJob.creator_name || (activeJob.sender_id && userMap[activeJob.sender_id]) || (activeJob as any).created_by_name || null) : null,
      current_job_id: activeJob ? (activeJob.id || (activeJob as any).job_no) : (d.current_job || null),
      elapsed_time: null,
      pickup_start_time: pickupStartTime,
      last_update: d.last_update ? new Date(d.last_update).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong',
      progress: computedProgress,
      allowed_floors: effectiveAllowedFloors,
      restricted_by_user_id: isExpired ? null : rawRestrictedByUserId,
      restricted_by_name: isExpired ? null : rawRestrictedByName,
      restricted_at: isExpired ? null : rawRestrictedAt,
      restriction_date: isExpired ? null : rawRestrictionDate,
      created_at: new Date().toISOString(),
      updated_at: d.last_update || new Date().toISOString(),
    };
  });

  const mappedJobs: Job[] = dbJobs.map(j => {
    const remarkStr = j.remark || '';
    const isUrgent = remarkStr.toLowerCase().includes('hỏa tốc') || remarkStr.toLowerCase().includes('khẩn');
    const isHigh = remarkStr.toLowerCase().includes('gấp') || remarkStr.toLowerCase().includes('ưu tiên');
    const qtyMatch = remarkStr.match(/x\s*(\d+)/i);
    const parsedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

    return {
      id: j.id,
      code: j.job_no || j.id,
      lift_id: j.lift_id || 'L1',
      lift_number: dbLifts.find(l => l.id === j.lift_id || l.lift_code === j.lift_id)?.lift_name || j.lift_id || 'Thang P1',
      created_by: j.sender_id || 'u1',
      creator_name: (j.sender_id && userMap[j.sender_id]) ? userMap[j.sender_id] : 'Nhân viên kho',
      source_floor: parseFloorWithMap(j.from_floor, floorMap),
      target_floor: parseFloorWithMap(j.to_floor, floorMap),
      status: (j.status as any) || 'CREATED',
      priority: isUrgent ? 'URGENT' : isHigh ? 'HIGH' : 'NORMAL',
      item_type: remarkStr.split(' x')[0] || 'Pallet Hàng',
      quantity: parsedQty || 1,
      notes: remarkStr,
      created_at: j.created_at,
      updated_at: j.completed_at || j.created_at,
      completed_at: j.completed_at || (j.status === 'COMPLETED' ? j.created_at : undefined)
    };
  });

  const today = getLocalDateString();
  const mergedLifts: Lift[] = mappedLifts.map(dbLift => {
    const localLift = currentLifts.find(l =>
      l.id === dbLift.id ||
      l.lift_number === dbLift.lift_number ||
      l.id === dbLift.lift_number ||
      checkSameLift(l.id, dbLift.id)
    );

    if (!localLift) return dbLift;

    // Xác định cấu hình giới hạn tầng chính xác nhất:
    // 1. localStorage là nguồn chân lý — nếu không có giới hạn trong localStorage → coi như không giới hạn
    // 2. Ưu tiên dbLift nếu đang có giới hạn hợp lệ (< 4 tầng và đúng ngày hôm nay)
    // 3. Kế đến giữ lại localLift nếu localLift đang có giới hạn hợp lệ trong ngày (phải có restriction_date)
    // 4. Mặc định [1, 2, 3, 4]
    const storedRestr = getStoredRestrictionForLift(dbLift.id, dbLift.lift_code, dbLift.lift_number);
    const storedHasRestr = Boolean(storedRestr?.allowed_floors && storedRestr.allowed_floors.length < 4);

    const dbHasRestr = Boolean(dbLift.allowed_floors && dbLift.allowed_floors.length < 4 && dbLift.restriction_date === today);
    // localHasRestr: phải có restriction_date hợp lệ (không chấp nhận null/undefined)
    const localHasRestr = Boolean(localLift.allowed_floors && localLift.allowed_floors.length < 4 && localLift.restriction_date && localLift.restriction_date === today);

    // Nếu localStorage đã xóa giới hạn → không cho phép localLift khôi phục lại giới hạn cũ
    const resolvedAllowedFloors = storedHasRestr
      ? storedRestr!.allowed_floors
      : dbHasRestr
        ? dbLift.allowed_floors!
        : (localHasRestr ? localLift.allowed_floors! : [1, 2, 3, 4]);

    const resolvedRestrictedByUserId = storedHasRestr
      ? (storedRestr!.restricted_by_user_id || null)
      : dbHasRestr
        ? dbLift.restricted_by_user_id
        : (localHasRestr ? localLift.restricted_by_user_id : null);

    const resolvedRestrictedByName = storedHasRestr
      ? (storedRestr!.restricted_by_name || null)
      : dbHasRestr
        ? dbLift.restricted_by_name
        : (localHasRestr ? localLift.restricted_by_name : null);

    const resolvedRestrictedAt = storedHasRestr
      ? (storedRestr!.restricted_at || null)
      : dbHasRestr
        ? dbLift.restricted_at
        : (localHasRestr ? localLift.restricted_at : null);

    const resolvedRestrictionDate = storedHasRestr
      ? (storedRestr!.restriction_date || null)
      : dbHasRestr
        ? dbLift.restriction_date
        : (localHasRestr ? localLift.restriction_date : null);

    // Phát hiện thang cập bến qua Polling / Realtime DB sync
    const isArriving = (
      (localLift.status === 'MOVING' && (dbLift.status === 'WAITING_PICKUP' || dbLift.status === 'AVAILABLE')) ||
      (localLift.status !== 'WAITING_PICKUP' && dbLift.status === 'WAITING_PICKUP') ||
      (localLift.status === 'WAITING_PICKUP' && dbLift.status === 'WAITING_PICKUP' && localLift.current_floor !== dbLift.current_floor)
    );
    if (isArriving) {
      const arrivedFloor = dbLift.current_floor || dbLift.destination_floor || localLift.destination_floor || 1;
      broadcastLiftArrival(dbLift.id, dbLift.lift_number, arrivedFloor, dbLift.status === 'WAITING_PICKUP');
    }

    if (localLift.status === 'MOVING') {
      const newStatus = (dbLift.status === 'WAITING_PICKUP' || dbLift.status === 'AVAILABLE') ? dbLift.status : 'MOVING';
      const validLocalProg = typeof localLift.progress === 'number' && !isNaN(localLift.progress) ? localLift.progress : 0;
      return {
        ...dbLift,
        status: newStatus,
        progress: newStatus === 'MOVING' ? validLocalProg : (newStatus === 'AVAILABLE' ? 0 : 100),
        elapsed_time: localLift.elapsed_time,
        pickup_start_time: dbLift.pickup_start_time ?? localLift.pickup_start_time,
        destination_floor: newStatus === 'AVAILABLE' ? null : (dbLift.destination_floor ?? localLift.destination_floor),
        source_floor: newStatus === 'AVAILABLE' ? null : (dbLift.source_floor ?? localLift.source_floor),
        current_job_id: newStatus === 'AVAILABLE' ? null : (dbLift.current_job_id ?? localLift.current_job_id),
        operator: newStatus === 'AVAILABLE' ? null : (localLift.operator || dbLift.operator || null),
        last_update: dbLift.last_update ?? localLift.last_update,
        allowed_floors: resolvedAllowedFloors,
        restricted_by_user_id: resolvedRestrictedByUserId,
        restricted_by_name: resolvedRestrictedByName,
        restricted_at: resolvedRestrictedAt,
        restriction_date: resolvedRestrictionDate,
      };
    }

    if (localLift.status === 'WAITING_PICKUP') {
      const hasWaitingJob = mappedJobs.some(j => checkSameLift(j.lift_id, dbLift.id) && j.status === 'WAITING_PICKUP');

      const newStatus = (dbLift.status === 'AVAILABLE' && !hasWaitingJob) ? 'AVAILABLE' : 'WAITING_PICKUP';
      const validLocalStart = localLift.pickup_start_time && (Date.now() - localLift.pickup_start_time >= 0 && Date.now() - localLift.pickup_start_time < 2 * 3600 * 1000)
        ? localLift.pickup_start_time
        : null;
      return {
        ...dbLift,
        status: newStatus,
        pickup_start_time: newStatus === 'WAITING_PICKUP' ? (validLocalStart ?? dbLift.pickup_start_time ?? Date.now()) : null,
        destination_floor: newStatus === 'WAITING_PICKUP' ? (dbLift.destination_floor ?? localLift.destination_floor) : null,
        source_floor: newStatus === 'WAITING_PICKUP' ? (dbLift.source_floor ?? localLift.source_floor) : null,
        current_job_id: newStatus === 'WAITING_PICKUP' ? (dbLift.current_job_id ?? localLift.current_job_id) : null,
        operator: newStatus === 'WAITING_PICKUP' ? (localLift.operator || dbLift.operator || null) : null,
        allowed_floors: resolvedAllowedFloors,
        restricted_by_user_id: resolvedRestrictedByUserId,
        restricted_by_name: resolvedRestrictedByName,
        restricted_at: resolvedRestrictedAt,
        restriction_date: resolvedRestrictionDate,
      };
    }

    return {
      ...dbLift,
      allowed_floors: resolvedAllowedFloors,
      restricted_by_user_id: resolvedRestrictedByUserId,
      restricted_by_name: resolvedRestrictedByName,
      restricted_at: resolvedRestrictedAt,
      restriction_date: resolvedRestrictionDate,
    };
  });

  // Giữ lại các job trong currentJobs chưa có trong mappedJobs để không bao giờ bị mất đơn khi polling định kỳ
  const existingJobCodes = new Set(mappedJobs.map(j => j.code || j.id));
  const retainedCurrentJobs = currentJobs.filter(cj => !existingJobCodes.has(cj.code || cj.id));
  const finalMergedJobs = [...mappedJobs, ...retainedCurrentJobs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { mergedLifts, mappedJobs: finalMergedJobs };
}

function processActivities(
  dbActivities: any[],
  dbUsers: any[],
  dbJobs: any[],
  dbLifts: any[],
  userMap: Record<string, string>
): ActivityLog[] {
  return dbActivities.map(a => {
    // Resolve user display name
    let displayUserName = 'Hệ Thống';
    if (a.user_id && a.user_id !== 'system') {
      if (userMap[a.user_id]) {
        displayUserName = userMap[a.user_id];
      } else {
        const foundUser = dbUsers.find(u => u.id === a.user_id || u.employee_code === a.user_id);
        if (foundUser) displayUserName = foundUser.full_name;
        else if (!a.user_id.includes('-') || a.user_id.length < 20) displayUserName = a.user_id;
      }
    }

    // Resolve entity display ID
    let displayEntityId = a.record_id || '';
    if (displayEntityId && (displayEntityId.length > 20 || displayEntityId.includes('-'))) {
      const matchingJob = dbJobs.find(j => j.id === displayEntityId || j.job_no === displayEntityId);
      if (matchingJob) {
        displayEntityId = matchingJob.job_no || matchingJob.id;
      } else {
        const matchingLift = dbLifts.find(l => l.id === displayEntityId);
        if (matchingLift) {
          displayEntityId = matchingLift.lift_name ? matchingLift.lift_name.replace('Lift ', 'Tời ') : 'Tời';
        } else {
          const matchingUser = dbUsers.find(u => u.id === displayEntityId);
          if (matchingUser) {
            displayEntityId = matchingUser.employee_code || matchingUser.full_name;
          } else {
            displayEntityId = '';
          }
        }
      }
    }

    // Sanitize any raw UUID strings inside description
    let cleanDescription = a.description || '';
    const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
    cleanDescription = cleanDescription.replace(uuidPattern, (uuidStr) => {
      const matchedJob = dbJobs.find(j => j.id === uuidStr);
      if (matchedJob) return matchedJob.job_no || 'đơn hàng';
      const matchedLift = dbLifts.find(l => l.id === uuidStr);
      if (matchedLift) return matchedLift.lift_name ? matchedLift.lift_name.replace('Lift ', 'Tời ') : 'Tời';
      const matchedUser = dbUsers.find(u => u.id === uuidStr);
      if (matchedUser) return matchedUser.full_name;
      return 'đối tượng';
    });

    // Determine badge action category
    const actLower = (a.action || '').toLowerCase();
    let catAction = 'system';
    if (actLower.includes('job') || actLower.includes('order')) catAction = 'job';
    else if (actLower.includes('assign')) catAction = 'assignment';
    else if (actLower.includes('alert') || actLower.includes('stop') || actLower.includes('warning')) catAction = 'alert';

    return {
      id: String(a.id),
      user_id: displayUserName,
      action: catAction,
      entity: a.table_name,
      entity_id: displayEntityId,
      description: cleanDescription,
      created_at: a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Vừa xong'
    };
  });
}

export const useLiftStore = create<LiftState>((set, get) => ({
  lifts: [],
  jobs: [],
  notifications: [],
  activities: [],
  isLoading: false,
  syncStatus: 'connecting',
  lastSyncedAt: null,

  setSyncStatus: (status, syncedAt) => set({
    syncStatus: status,
    lastSyncedAt: syncedAt ?? (status === 'realtime' || status === 'polling' ? new Date() : get().lastSyncedAt)
  }),

  updateLift: (liftId, updates) => {
    // If updating ONLY progress, update local store state without issuing a DB write
    if (Object.keys(updates).length === 1 && updates.progress !== undefined) {
      set((state) => ({
        lifts: state.lifts.map((lift) =>
          lift.id === liftId ? { ...lift, progress: updates.progress! } : lift
        )
      }));
      return;
    }

    markLocalAction(2500);

    const prevLift = get().lifts.find(l => l.id === liftId || l.lift_number === liftId);

    // Save to DB (lifts table)
    const statusMap: Record<string, number> = {
      'AVAILABLE': 1,
      'MOVING': 2,
      'WAITING_PICKUP': 3,
      'LOCKED': 4,
      'MAINTENANCE': 5,
      'OFFLINE': 6,
      'STOPPED': 5
    };
    const dbUpdates: any = {};
    if (updates.status && statusMap[updates.status]) {
      dbUpdates.status_id = statusMap[updates.status];
    }
    if (updates.current_floor !== undefined) {
      dbUpdates.current_floor = `f${updates.current_floor}`;
    }
    if (updates.current_job_id !== undefined) {
      dbUpdates.current_job = updates.current_job_id;
    }
    if (updates.allowed_floors !== undefined) {
      dbUpdates.allowed_floors = updates.allowed_floors;
      saveStoredFloorRestriction(liftId, {
        allowed_floors: updates.allowed_floors,
        restricted_by_user_id: updates.restricted_by_user_id,
        restricted_by_name: updates.restricted_by_name,
        restricted_at: updates.restricted_at,
        restriction_date: updates.restriction_date
      });
      if (prevLift && prevLift.id !== liftId) {
        saveStoredFloorRestriction(prevLift.id, {
          allowed_floors: updates.allowed_floors,
          restricted_by_user_id: updates.restricted_by_user_id,
          restricted_by_name: updates.restricted_by_name,
          restricted_at: updates.restricted_at,
          restriction_date: updates.restriction_date
        });
      }
    }
    if (updates.restricted_by_user_id !== undefined) {
      dbUpdates.restricted_by_user_id = updates.restricted_by_user_id;
    }
    if (updates.restricted_by_name !== undefined) {
      dbUpdates.restricted_by_name = updates.restricted_by_name;
    }
    if (updates.restricted_at !== undefined) {
      dbUpdates.restricted_at = updates.restricted_at;
    }
    if (updates.restriction_date !== undefined) {
      dbUpdates.restriction_date = updates.restriction_date;
    }

    // Direct synchronization for uncollected timer (pickup_start_time)
    if (updates.status === 'WAITING_PICKUP' && !updates.pickup_start_time) {
      updates.pickup_start_time = Date.now();
    } else if (updates.status && updates.status !== 'WAITING_PICKUP') {
      updates.pickup_start_time = null;
    }

    if (updates.pickup_start_time !== undefined) {
      dbUpdates.pickup_start_time = updates.pickup_start_time;
      if (updates.pickup_start_time) {
        dbUpdates.last_update = new Date(updates.pickup_start_time).toISOString();
      }
    } else if (updates.status === 'MOVING') {
      dbUpdates.last_update = new Date().toISOString();
    }

    db.lifts.update(liftId, dbUpdates).catch(console.error);

    // Save lift command log into lift_commands table
    if (updates.status || updates.destination_floor !== undefined || updates.current_job_id !== undefined) {
      db.liftCommands.create({
        lift_id: liftId,
        command: updates.status ? `SET_STATUS_${updates.status}` : 'MOVE_LIFT',
        payload: {
          current_floor: updates.current_floor,
          destination_floor: updates.destination_floor,
          job_id: updates.current_job_id,
          status: updates.status
        },
        status: 'EXECUTED',
        created_by: 'u1',
        executed_at: new Date().toISOString()
      }).catch(console.error);
    }

    // Phát thanh thông báo đến tầng qua toàn bộ hệ thống (BroadcastChannel, DB Notification, Local TTS)
    if (updates.status && prevLift?.status === 'MOVING' && ['WAITING_PICKUP', 'AVAILABLE'].includes(updates.status)) {
      const destFloor = updates.current_floor || prevLift?.destination_floor || prevLift?.current_floor || 1;
      const liftName = prevLift?.lift_number || liftId;
      broadcastLiftArrival(liftId, liftName, destFloor, updates.status === 'WAITING_PICKUP');
    }

    set((state) => ({
      lifts: state.lifts.map((lift) =>
        (lift.id === liftId || lift.id === prevLift?.id || isSameLift(lift.id, liftId) || isSameLift(lift.lift_number, liftId))
          ? { ...lift, ...updates, updated_at: new Date().toISOString(), last_update: 'Vừa xong' }
          : lift
      )
    }));
  },

  checkAndResetExpiredRestrictions: () => {
    const today = getLocalDateString();
    const currentLifts = get().lifts;
    let hasChanges = false;
    const updatedLifts = currentLifts.map((lift) => {
      // Nếu thang đang bị giới hạn tầng (số tầng < 4) nhưng restriction_date đã qua ngày hôm nay -> tự động reset
      if (lift.allowed_floors && lift.allowed_floors.length < 4 && lift.restriction_date && lift.restriction_date !== today) {
        hasChanges = true;
        const resetUpdates = {
          allowed_floors: [1, 2, 3, 4],
          restricted_by_user_id: null,
          restricted_by_name: null,
          restricted_at: null,
          restriction_date: null
        };
        db.lifts.update(lift.id, resetUpdates).catch(console.error);

        // Ghi log tự động reset hệ thống
        db.activityLogs.add({
          user_id: 'system',
          action: 'RESET_FLOOR_RESTRICTION',
          table_name: 'lifts',
          record_id: lift.id,
          description: `Hệ thống tự động giải phóng giới hạn tầng (sau 00:00) cho ${lift.lift_number}. Tời đã có thể di chuyển qua tất cả các tầng.`,
          event_type: 'SYSTEM_EVENT'
        }).catch(console.error);

        return {
          ...lift,
          ...resetUpdates,
          updated_at: new Date().toISOString()
        };
      }
      return lift;
    });

    if (hasChanges) {
      set({ lifts: updatedLifts });
    }
  },

  updateJob: async (jobId, updates) => {
    markLocalAction(2500);
    const targetJob = get().jobs.find(j => j.id === jobId || j.code === jobId);
    const code = targetJob?.code || jobId;
    const realId = targetJob?.id || jobId;

    // Save to DB
    const isCompleted = updates.status === 'COMPLETED';
    const completedAt = isCompleted ? new Date().toISOString() : undefined;

    await db.transportJobs.update(realId, {
      ...(updates.status ? { status: updates.status as any } : {}),
      ...(updates.notes !== undefined ? { remark: updates.notes } : {}),
      ...(completedAt ? { completed_at: completedAt } : {})
    }).catch(console.error);

    if (updates.status && targetJob && updates.status !== targetJob.status) {
      let logDesc = `Cập nhật công việc #${code}: ${updates.status}`;
      if (updates.status === 'COMPLETED') {
        logDesc = `Đã hoàn thành công việc #${code} (Kéo hàng tại Tầng ${targetJob.target_floor})`;
      } else if (updates.status === 'WAITING_PICKUP') {
        logDesc = `Công việc #${code} đã tới Tầng ${targetJob.target_floor} (Chờ kéo hàng)`;
      } else if ((updates.status as string) === 'MOVING') {
        logDesc = `Đang vận chuyển công việc #${code} từ Tầng ${targetJob.source_floor} ➔ Tầng ${targetJob.target_floor}`;
      }

      await db.activityLogs.add({
        user_id: targetJob.created_by || 'system',
        action: updates.status === 'COMPLETED' ? 'COMPLETE_JOB' : 'UPDATE_JOB',
        table_name: 'transport_jobs',
        record_id: isUuid(realId) ? realId : code,
        description: logDesc,
        event_type: 'JOB_EVENT'
      }).catch(console.error);

      await db.jobTimeline.create({
        job_id: realId,
        status: updates.status,
        action_by: targetJob.created_by || 'system',
        remark: logDesc
      }).catch(console.error);

      const newActivity: ActivityLog = {
        id: `act-${Date.now()}`,
        user_id: targetJob.creator_name || 'Nhân viên kho',
        action: 'job',
        entity: 'transport_jobs',
        entity_id: code,
        description: logDesc,
        created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      set((state) => ({
        activities: [newActivity, ...state.activities]
      }));
    }

    set((state) => ({
      jobs: state.jobs.map((job) =>
        (job.id === jobId || job.code === jobId)
          ? {
              ...job,
              ...updates,
              ...(completedAt ? { completed_at: completedAt } : {}),
              updated_at: new Date().toISOString()
            }
          : job
      )
    }));
  },

  addJob: async (jobData) => {
    const targetLift = get().lifts.find(l => isSameLift(l.id, jobData.lift_id) || isSameLift(l.lift_number, jobData.lift_id) || l.id === jobData.lift_id);
    if (targetLift) {
      if (['MAINTENANCE', 'OFFLINE', 'STOPPED'].includes(targetLift.status)) {
        const statusText = 'DỪNG BẢO TRÌ/KHẨN CẤP';
        throw new Error(`Tời ${targetLift.lift_number || 'được chọn'} hiện đang ở trạng thái ${statusText}! Không thể tiếp nhận đơn mới.`);
      }

      const effectiveAllowed = getEffectiveAllowedFloors(targetLift);
      if (effectiveAllowed && effectiveAllowed.length < 4) {
        if (jobData.target_floor && !effectiveAllowed.includes(jobData.target_floor)) {
          throw new Error(`🚫 Tầng đích (Tầng ${jobData.target_floor}) đã bị Quản lý giới hạn hoạt động đối với tời này! Tời chỉ được di chuyển trong các tầng: ${effectiveAllowed.join(', ')}.`);
        }
        if (jobData.source_floor && !effectiveAllowed.includes(jobData.source_floor)) {
          throw new Error(`🚫 Tầng gửi (Tầng ${jobData.source_floor}) đã bị Quản lý giới hạn hoạt động đối với tời này! Tời chỉ được di chuyển trong các tầng: ${effectiveAllowed.join(', ')}.`);
        }
      }
    }

    const d = new Date();
    const timeSeq = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
    const randSeq = Math.floor(100 + Math.random() * 900);
    const newCode = `TR-${timeSeq}-${randSeq}`;
    const newJob: Job = {
      id: `job-${Date.now()}`,
      code: newCode,
      lift_id: jobData.lift_id || 'L1',
      lift_number: get().lifts.find(l => l.id === jobData.lift_id)?.lift_number || 'Thang P1',
      created_by: jobData.created_by || 'u1',
      creator_name: jobData.creator_name || 'Nhân viên kho',
      source_floor: jobData.source_floor || 1,
      target_floor: jobData.target_floor || 2,
      status: jobData.status || 'CREATED',
      priority: jobData.priority || 'NORMAL',
      item_type: jobData.item_type || 'Pallet Hàng',
      quantity: jobData.quantity || 1,
      notes: jobData.notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Save transport_job to Database
    const createdDbJob = await db.transportJobs.create({
      job_no: newCode,
      lift_id: newJob.lift_id,
      from_floor: `f${newJob.source_floor}`,
      to_floor: `f${newJob.target_floor}`,
      sender_id: newJob.created_by,
      status: newJob.status as any,
      remark: `${newJob.item_type} x${newJob.quantity} - ${newJob.notes}`
    }).catch(() => null);

    if (createdDbJob?.id) {
      newJob.id = createdDbJob.id;
    }

    // Đánh dấu thao tác cục bộ để Realtime WebSocket không re-fetch lặp lại
    markLocalAction(2500);

    const logDesc = `Đã tạo công việc #${newCode} (T${newJob.source_floor} ➔ T${newJob.target_floor} - ${newJob.item_type})`;

    // Ghi nhật ký & thông báo phụ song song (non-blocking) không làm chậm giao diện
    Promise.allSettled([
      db.activityLogs.add({
        user_id: newJob.created_by,
        action: 'CREATE_JOB',
        table_name: 'transport_jobs',
        record_id: isUuid(newJob.id) ? newJob.id : newCode,
        description: logDesc,
        event_type: 'JOB_EVENT'
      }),
      db.jobTimeline.create({
        job_id: newJob.id,
        status: newJob.status,
        action_by: newJob.created_by,
        remark: logDesc
      }),
      db.notifications.create({
        job_id: newJob.id,
        notification_type: 'NEW_JOB',
        receiver_id: newJob.created_by,
        title: 'Đã tạo công việc mới',
        message: `Công việc #${newCode} vừa được tạo từ Tầng ${newJob.source_floor} đến Tầng ${newJob.target_floor}.`,
        status: 'SENT'
      })
    ]).catch(() => {});

    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      user_id: newJob.creator_name || 'Nhân viên kho',
      action: 'job',
      entity: 'transport_jobs',
      entity_id: newCode,
      description: logDesc,
      created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: 'Đã tạo công việc mới',
      message: `Công việc #${newCode} vừa được tạo từ Tầng ${newJob.source_floor} đến Tầng ${newJob.target_floor}.`,
      severity: newJob.priority === 'URGENT' ? 'warning' : 'info',
      category: 'job',
      is_read: false,
      created_at: new Date().toISOString(),
      link_id: newCode
    };

    set((state) => ({
      jobs: [newJob, ...state.jobs],
      activities: [newActivity, ...state.activities],
      notifications: [newNotif, ...state.notifications]
    }));

    return newJob;
  },

  cancelJob: async (jobId) => {
    const targetJob = get().jobs.find(j => j.id === jobId || j.code === jobId);
    const code = targetJob?.code || jobId;
    const realId = targetJob?.id || jobId;

    await db.transportJobs.update(realId, { status: 'CANCELLED' }).catch(console.error);

    await db.jobTimeline.create({
      job_id: realId,
      status: 'CANCELLED',
      action_by: targetJob?.created_by || 'u1',
      remark: `Hủy đơn vận chuyển #${code}`
    }).catch(console.error);

    const logDesc = `Đã hủy đơn vận chuyển #${code}`;
    await db.activityLogs.add({
      user_id: targetJob?.created_by || 'u1',
      action: 'CANCEL_JOB',
      table_name: 'transport_jobs',
      record_id: code,
      description: logDesc,
      event_type: 'JOB_EVENT'
    }).catch(console.error);

    set((state) => ({
      jobs: state.jobs.map(j => (j.id === jobId || j.code === jobId) ? { ...j, status: 'CANCELLED', updated_at: new Date().toISOString() } : j),
      activities: [
        {
          id: `act-${Date.now()}`,
          user_id: 'user',
          action: 'job',
          entity: 'job',
          entity_id: code,
          description: logDesc,
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...state.activities
      ]
    }));
  },

  markNotificationRead: (id) => {
    db.notifications.updateStatus(id, 'READ').catch(console.error);
    set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, is_read: true } : n)
    }));
  },

  markAllNotificationsRead: () => {
    const notifs = get().notifications;
    notifs.forEach(n => db.notifications.updateStatus(n.id, 'READ').catch(console.error));
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, is_read: true }))
    }));
  },

  clearNotifications: () => set(() => ({
    notifications: []
  })),

  addActivity: (activityData) => {
    db.activityLogs.add({
      user_id: activityData.user_id || 'u1',
      action: activityData.action.toUpperCase(),
      table_name: activityData.entity || 'system',
      record_id: activityData.entity_id || '',
      description: activityData.description,
      event_type: 'SYSTEM_EVENT'
    }).catch(console.error);

    set((state) => ({
      activities: [
        {
          id: `act-${Date.now()}`,
          ...activityData,
          created_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        },
        ...state.activities
      ]
    }));
  },

  // Dynamic polling: fetch lifts + transport_jobs (nhẹ, chạy mỗi chu kỳ polling/Realtime)
  // Khi includeLogs=true (do Realtime INSERT vào notifications/activity_logs): fetch thêm 2 bảng đó
  fetchDynamicData: async (includeLogs = false) => {
    if (_isFetchingInitial || _isFetchingDynamic) return;
    _isFetchingDynamic = true;
    // Nếu chưa có cache, ưu tiên nạp từ bộ nhớ đệm thiết bị trước khi gọi database
    if (_cachedFloors.length === 0 || _cachedUsers.length === 0) {
      if (!loadStaticMetadataCache()) {
        await get().fetchInitialData();
        return;
      }
    }

    try {
      const [dbLifts, dbJobs, dbNotifs, dbActivities] = await Promise.all([
        db.lifts.getAll(),
        db.transportJobs.getAll(),
        includeLogs ? db.notifications.getAll() : Promise.resolve(null),
        includeLogs ? db.activityLogs.getAll() : Promise.resolve(null)
      ]);

      const { mergedLifts, mappedJobs } = processLiftsAndJobs(
        dbLifts,
        dbJobs,
        get().lifts,
        get().jobs,
        _cachedStatusCodeMap,
        _cachedUserMap,
        _cachedFloorMap
      );

      const mappedNotifs: AppNotification[] = dbNotifs
        ? dbNotifs.map(n => ({
            id: n.id,
            title: n.title,
            message: n.message,
            severity: (n.notification_type && (n.notification_type.includes('WARNING') || n.notification_type.includes('URGENT'))) ? 'warning' : 'info',
            category: (n.notification_type?.includes('AUDIO_DISPATCH') || n.message?.includes('[AUDIO_DISPATCH')) ? 'system' : 'job',
            is_read: n.status === 'READ',
            created_at: n.created_at,
            link_id: n.job_id
          }))
        : [];

      const mappedActivities = dbActivities
        ? processActivities(
            dbActivities,
            _cachedUsers,
            dbJobs,
            dbLifts,
            _cachedUserMap
          )
        : [];

      set(state => ({
        lifts: mergedLifts.length > 0 ? mergedLifts : state.lifts,
        jobs: mappedJobs,
        ...(dbNotifs !== null ? { notifications: mappedNotifs } : {}),
        ...(dbActivities !== null ? { activities: mappedActivities } : {})
      }));
    } catch (e) {
      console.warn('[LiftStore] fetchDynamicData gặp lỗi (sẽ thử lại ở chu kỳ kế tiếp):', e);
    } finally {
      _isFetchingDynamic = false;
    }
  },

  // Full fetch: tải toàn bộ 7 bảng và lưu cache dữ liệu tĩnh
  fetchInitialData: async () => {
    if (_isFetchingInitial) return;
    _isFetchingInitial = true;
    set({ isLoading: true });
    try {
      const [dbLifts, dbJobs, dbNotifs, dbActivities, dbStatusList, dbUsers, dbFloors] = await Promise.all([
        db.lifts.getAll(),
        db.transportJobs.getAll(),
        db.notifications.getAll(),
        db.activityLogs.getAll(),
        db.liftStatus.getAll(),
        db.users.getAll(),
        db.floors.getAll()
      ]);

      // Lưu cache dữ liệu tĩnh
      _cachedStatusList = dbStatusList;
      _cachedUsers = dbUsers;
      _cachedFloors = dbFloors;

      _cachedStatusCodeMap = {};
      dbStatusList.forEach(s => {
        _cachedStatusCodeMap[s.id] = s.status_code;
      });

      _cachedUserMap = {};
      dbUsers.forEach(u => {
        _cachedUserMap[u.id] = u.full_name;
      });

      _cachedFloorMap = {};
      dbFloors.forEach(f => {
        _cachedFloorMap[f.id] = f.floor_no;
      });

      // Lưu vào bộ nhớ đệm của thiết bị (localStorage) với hạn sử dụng 1 giờ
      try {
        localStorage.setItem(STATIC_CACHE_KEY, JSON.stringify({
          statusList: dbStatusList,
          users: dbUsers,
          floors: dbFloors,
          statusCodeMap: _cachedStatusCodeMap,
          userMap: _cachedUserMap,
          floorMap: _cachedFloorMap,
          timestamp: Date.now()
        }));
      } catch (err) { }

      const { mergedLifts, mappedJobs } = processLiftsAndJobs(
        dbLifts,
        dbJobs,
        get().lifts,
        get().jobs,
        _cachedStatusCodeMap,
        _cachedUserMap,
        _cachedFloorMap
      );

      // Map notifications
      const mappedNotifs: AppNotification[] = (dbNotifs || []).map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        severity: (n.notification_type && (n.notification_type.includes('WARNING') || n.notification_type.includes('URGENT'))) ? 'warning' : 'info',
        category: (n.notification_type?.includes('AUDIO_DISPATCH') || n.message?.includes('[AUDIO_DISPATCH')) ? 'system' : 'job',
        is_read: n.status === 'READ',
        created_at: n.created_at,
        link_id: n.job_id
      }));

      // Map activities
      const mappedActivities = processActivities(
        dbActivities,
        dbUsers,
        dbJobs,
        dbLifts,
        _cachedUserMap
      );

      set({
        lifts: mergedLifts.length > 0 ? mergedLifts : mockLifts,
        jobs: mappedJobs,
        notifications: mappedNotifs.length > 0 ? mappedNotifs : mockNotifications,
        activities: mappedActivities.length > 0 ? mappedActivities : mockActivities
      });

    } catch (e) {
      console.error('Failed to fetch initial data from database:', e);
      set({ lifts: mockLifts, jobs: mockJobs, notifications: mockNotifications, activities: mockActivities });
    } finally {
      _isFetchingInitial = false;
      set({ isLoading: false });
    }
  },

  simulateRealtime: () => {
    // Realtime sync simulation
  }
}));

