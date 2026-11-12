export const safeParseTimestamp = (val: any): number => {
    if (typeof val === 'number' && val > 0) return val;
    if (!val) return Date.now();
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return Date.now();
        if (/^\d{10,13}$/.test(trimmed)) {
            const num = Number(trimmed);
            return num < 1e11 ? num * 1000 : num;
        }

        // Hỗ trợ định dạng ngày Việt Nam / Google Sheets: DD/MM/YYYY hoặc DD/MM/YYYY HH:mm:ss
        const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (dmyMatch) {
            const [, d, m, y, h, min, s] = dmyMatch;
            const date = new Date(
                Number(y),
                Number(m) - 1,
                Number(d),
                h ? Number(h) : 0,
                min ? Number(min) : 0,
                s ? Number(s) : 0
            );
            if (!isNaN(date.getTime()) && date.getTime() > 0) return date.getTime();
        }

        // Chuẩn hóa chuỗi ngày YYYY-MM-DD HH:mm:ss
        let iso = trimmed;
        if (!iso.includes('T') && iso.includes(' ')) {
            iso = iso.replace(' ', 'T');
        }

        // Thử parse thông thường (ưu tiên giữ nguyên timezone nếu có)
        const parsedNormal = new Date(iso).getTime();
        if (!isNaN(parsedNormal) && parsedNormal > 0) {
            return parsedNormal;
        }

        // Fallback: nếu chuỗi ISO chưa có Z và chưa có offset, thêm Z để parse UTC
        if (!iso.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(iso)) {
            iso = iso + 'Z';
            const parsedZ = new Date(iso).getTime();
            if (!isNaN(parsedZ) && parsedZ > 0) return parsedZ;
        }
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