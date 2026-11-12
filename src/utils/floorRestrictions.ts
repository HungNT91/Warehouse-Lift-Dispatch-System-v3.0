import { getLocalDateString } from './time';

const STORAGE_KEY = 'wlds_lift_floor_restrictions_v2';

export interface StoredFloorRestriction {
  allowed_floors: number[];
  restricted_by_user_id?: string | null;
  restricted_by_name?: string | null;
  restricted_at?: string | null;
  restriction_date?: string | null;
}

/**
 * Đọc tất cả các cấu hình giới hạn tầng đã lưu từ localStorage.
 * Tự động loại bỏ các cấu hình đã quá hạn (sau 00:00 ngày mới).
 */
export const loadStoredFloorRestrictions = (): Record<string, StoredFloorRestriction> => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const today = getLocalDateString();
        const valid: Record<string, StoredFloorRestriction> = {};
        for (const [key, val] of Object.entries(parsed)) {
          const item = val as StoredFloorRestriction;
          if (
            item &&
            item.restriction_date === today &&
            Array.isArray(item.allowed_floors) &&
            item.allowed_floors.length < 4
          ) {
            valid[key] = item;
          }
        }
        return valid;
      }
    }
  } catch (e) {
    console.warn('Could not load stored floor restrictions:', e);
  }
  return {};
};

/**
 * Lưu giới hạn tầng của 1 tời vào localStorage
 */
export const saveStoredFloorRestriction = (
  liftId: string,
  restriction: StoredFloorRestriction
) => {
  try {
    const current = loadStoredFloorRestrictions();
    const today = getLocalDateString();
    const normKey = liftId.trim();
    const liftNum = extractLiftNumber(normKey);

    const isAllFloors = !restriction.allowed_floors || restriction.allowed_floors.length >= 4;

    if (isAllFloors) {
      delete current[normKey];
      // Xóa các key tương đương nếu có
      for (const k of Object.keys(current)) {
        if (
          k.replace(/[^0-9a-zA-Z]/g, '').toLowerCase() === normKey.replace(/[^0-9a-zA-Z]/g, '').toLowerCase() ||
          (liftNum !== null && extractLiftNumber(k) === liftNum)
        ) {
          delete current[k];
        }
      }
    } else {
      const dataToSave = {
        ...restriction,
        restriction_date: restriction.restriction_date || today
      };
      current[normKey] = dataToSave;
      if (liftNum !== null) {
        current[`L${liftNum}`] = dataToSave;
        current[`Lift 0${liftNum}`] = dataToSave;
        current[`Tời 0${liftNum}`] = dataToSave;
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    return current;
  } catch (e) {
    console.warn('Could not save floor restriction to localStorage:', e);
    return {};
  }
};

/**
 * Lấy số hiệu tời từ chuỗi định danh (VD: 'L1' -> 1, 'Tời 02' -> 2, 'Lift 3' -> 3)
 */
export const extractLiftNumber = (val: string | null | undefined): number | null => {
  if (!val) return null;
  const str = String(val).trim();
  // UUID fallback: 22222222-2222-4222-a222-111111111111 -> 1
  const uuidMap: Record<string, number> = {
    '22222222-2222-4222-a222-111111111111': 1,
    '22222222-2222-4222-a222-222222222222': 2,
    '22222222-2222-4222-a222-333333333333': 3,
    '22222222-2222-4222-a222-444444444444': 4,
    '22222222-2222-4222-a222-555555555555': 5,
    '22222222-2222-4222-a222-666666666666': 6,
  };
  if (uuidMap[str]) return uuidMap[str];

  const match = str.match(/(?:lift|tời|thang|l)[^\d]*(\d+)/i) || str.match(/(\d+)/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num >= 1 && num <= 10) return num;
  }
  return null;
};

/**
 * Lấy cấu hình giới hạn tầng của 1 tời dựa theo ID, mã tời hoặc tên tời
 */
export const getStoredRestrictionForLift = (
  liftId: string,
  liftCode?: string | null,
  liftName?: string | null
): StoredFloorRestriction | null => {
  const current = loadStoredFloorRestrictions();
  const keys = [liftId, liftCode, liftName].filter(Boolean) as string[];

  // 1. Khớp chính xác theo key
  for (const k of keys) {
    if (current[k]) return current[k];
    const cleanK = k.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    for (const [storedKey, storedVal] of Object.entries(current)) {
      if (storedKey.replace(/[^0-9a-zA-Z]/g, '').toLowerCase() === cleanK) {
        return storedVal;
      }
    }
  }

  // 2. Khớp thông minh theo số hiệu tời (VD: Tời 1 khớp với L1, Lift 01)
  const targetNums = keys.map(k => extractLiftNumber(k)).filter(n => n !== null) as number[];
  if (targetNums.length > 0) {
    for (const [storedKey, storedVal] of Object.entries(current)) {
      const storedNum = extractLiftNumber(storedKey);
      if (storedNum !== null && targetNums.includes(storedNum)) {
        return storedVal;
      }
    }
  }

  return null;
};

/**
 * Đồng bộ cấu hình giới hạn tầng từ DB (system_settings) vào localStorage.
 * Nếu một tời đã bị gỡ giới hạn trên DB, cấu hình cũ sẽ được xóa sạch khỏi localStorage.
 */
export const mergeRemoteFloorRestrictions = (remoteRestrictions: Record<string, StoredFloorRestriction>) => {
  if (!remoteRestrictions || typeof remoteRestrictions !== 'object') return;
  try {
    const today = getLocalDateString();
    const valid: Record<string, StoredFloorRestriction> = {};

    for (const [key, val] of Object.entries(remoteRestrictions)) {
      if (val && val.restriction_date === today && Array.isArray(val.allowed_floors) && val.allowed_floors.length < 4) {
        valid[key] = val;
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
  } catch (e) {
    console.warn('Could not merge remote floor restrictions:', e);
  }
};

