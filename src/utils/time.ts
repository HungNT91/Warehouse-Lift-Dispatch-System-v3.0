export const safeParseTimestamp = (val: any): number => {
    if (typeof val === 'number' && val > 0) return val;
    if (!val) return Date.now();
    if (typeof val === 'string') {
        if (/^\d+$/.test(val)) {
            const num = Number(val);
            if (num > 0) return num;
        }
        let iso = val.trim();
        if (!iso.includes('T') && iso.includes(' ')) {
            iso = iso.replace(' ', 'T');
        }
        if (!iso.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(iso)) {
            iso = iso + 'Z';
        }
        const parsed = new Date(iso).getTime();
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return Date.now();
};

export const isSameLift = (val1: any, val2: any): boolean => {
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

/**
 * Trả về chuỗi ngày YYYY-MM-DD theo giờ địa phương
 */
export const getLocalDateString = (date: Date = new Date()): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Kiểm tra xem thang tời có đang bị giới hạn tầng có hiệu lực trong ngày hôm nay hay không
 */
export const hasActiveFloorRestriction = (lift: {
    allowed_floors?: number[] | null;
    restriction_date?: string | null;
}): boolean => {
    if (!lift || !lift.allowed_floors || !Array.isArray(lift.allowed_floors)) {
        return false;
    }
    // Nếu tất cả 4 tầng [1, 2, 3, 4] thì không phải là bị hạn chế
    if (lift.allowed_floors.length >= 4) {
        return false;
    }
    // Nếu có ngày giới hạn, chỉ có hiệu lực nếu ngày đó là ngày hôm nay
    if (lift.restriction_date) {
        const today = getLocalDateString();
        return lift.restriction_date === today;
    }
    // Nếu chưa có restriction_date nhưng số tầng < 4, coi như có hiệu lực
    return true;
};

/**
 * Lấy danh sách tầng được phép hoạt động của tời.
 * Nếu qua 12h đêm (khác ngày hôm nay), tự động trả về [1, 2, 3, 4] (hết giới hạn).
 */
export const getEffectiveAllowedFloors = (lift: {
    allowed_floors?: number[] | null;
    restriction_date?: string | null;
}): number[] => {
    if (!lift || !lift.allowed_floors || !Array.isArray(lift.allowed_floors) || lift.allowed_floors.length === 0) {
        return [1, 2, 3, 4];
    }
    if (lift.allowed_floors.length >= 4) {
        return [1, 2, 3, 4];
    }
    if (hasActiveFloorRestriction(lift)) {
        return [...lift.allowed_floors].sort((a, b) => a - b);
    }
    // Hết hạn trong ngày -> tự động mở tất cả các tầng
    return [1, 2, 3, 4];
};