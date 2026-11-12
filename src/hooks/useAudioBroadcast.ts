import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useLiftStore } from '../stores/useLiftStore';
import { speakText } from '../utils/audio';
import { toast } from 'sonner';
import type { Lift } from '../types';

// Set to track played audio notification IDs on this client session to avoid double speech
export const playedNotificationIds = new Set<string>();

/** Unique session ID per browser tab to avoid self-echo while allowing other tabs/devices to speak */
function getSessionId(): string {
    if (typeof window === 'undefined') return '';
    try {
        let sid = sessionStorage.getItem('wlds_session_id');
        if (!sid) {
            sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            sessionStorage.setItem('wlds_session_id', sid);
        }
        return sid;
    } catch {
        return '';
    }
}

/** Check if two lift identifiers refer to the same lift */
function isSameLift(val1: any, val2: any): boolean {
    if (!val1 || !val2) return false;
    if (val1 === val2) return true;
    const s1 = String(val1).toLowerCase().trim();
    const s2 = String(val2).toLowerCase().trim();
    if (s1 === s2) return true;
    const num1 = s1.replace(/[^0-9]/g, '');
    const num2 = s2.replace(/[^0-9]/g, '');
    if (num1 && num2 && num1 === num2 && num1.length <= 2) return true;
    return false;
}

/**
 * Lấy cấu hình trạm làm việc / tầng của thiết bị này (Station Floor)
 * Giá trị: 1 | 2 | 3 | 4 | 0 (0 = Chế độ giám sát toàn kho) | null (Tự động theo ca làm việc / tài khoản)
 */
export function getDeviceStationFloor(): number | null {
    if (typeof window === 'undefined') return null;
    try {
        const val = localStorage.getItem('wlds_station_floor') || sessionStorage.getItem('wlds_station_floor');
        if (!val || val === 'AUTO') return null;
        if (val.toUpperCase() === 'ALL') return 0;
        const num = parseInt(val.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num >= 0) return num;
    } catch { }
    return null;
}

/** Robust recipient floor resolution */
export function getRecipientFloor(user: any, assignment: any): number | null {
    // 1. Kiểm tra cấu hình gán trực tiếp cho thiết bị này trước
    const deviceFloor = getDeviceStationFloor();
    if (deviceFloor !== null) {
        return deviceFloor;
    }

    // 2. Ca làm việc phân công hiện tại
    if (assignment?.assigned_floor && Number(assignment.assigned_floor) > 0) {
        return Number(assignment.assigned_floor);
    }
    // 3. Thông tin tài khoản
    if ((user as any)?.assigned_floor && Number((user as any).assigned_floor) > 0) {
        return Number((user as any).assigned_floor);
    }
    const floorIdStr = String((user as any)?.floor_id || '');
    if (floorIdStr) {
        const num = parseInt(floorIdStr.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(num) && num > 0) return num;
    }
    // Fallback: match known employee codes or patterns
    if (user?.employee_code) {
        const emp = user.employee_code.toUpperCase();
        if (emp === 'NV-002') return 2;
        if (emp === 'NV-003') return 4;
        if (emp === 'NV-004') return 1;
        const match = emp.match(/F([1-4])/i) || emp.match(/T([1-4])/i);
        if (match) return parseInt(match[1], 10);
    }
    if (user?.id) {
        if (user.id === 'u2') return 2;
        if (user.id === 'u3') return 4;
        if (user.id === 'u4') return 1;
    }
    return null;
}

/** Robust recipient lift resolution */
export function getRecipientLiftId(user: any, assignment: any): string | null {
    if (assignment?.lift_id) return String(assignment.lift_id);
    if ((user as any)?.lift_id) return String((user as any).lift_id);
    return null;
}

/** 
 * Xác định xem thiết bị này có được phát âm thanh TTS hay không.
 * NGUYÊN TẮC:
 * 1. Chặn self-echo trên chính tab gửi.
 * 2. Nếu targetFloor === 0: Kênh thông báo chung toàn kho -> Tất cả thiết bị đều phát.
 * 3. Nếu targetFloor > 0: Thông báo chỉ định tầng nhận hàng (ví dụ: Tời đến Tầng 3 nhận hàng):
 *    -> CHỈ THIẾT BỊ Ở TẦNG ĐÓ MỚI ĐƯỢC PHÁT!
 *    -> Các thiết bị ở tầng khác (kể cả đăng nhập Admin/Supervisor) TUYỆT ĐỐI KHÔNG ĐƯỢC PHÁT!
 */
export function shouldPlayForRecipient(
    targetFloor: number,
    targetLift: string,
    senderSessionId: string,
    user: any,
    assignment: any
): boolean {
    // 1. Prevent echo on the exact browser tab that triggered the broadcast
    const mySessionId = getSessionId();
    if (senderSessionId && mySessionId && mySessionId === senderSessionId) {
        return false;
    }

    // 2. Thông báo kênh chung toàn kho (targetFloor === 0)
    if (targetFloor === 0) {
        return true;
    }

    // 3. Thông báo gửi đến tầng nhận hàng cụ thể (targetFloor > 0):
    // Xác định tầng của thiết bị này:
    const recipientFloor = getRecipientFloor(user, assignment);

    // Nếu thiết bị được cấu hình chế độ Tổng / Toàn kho (0)
    if (recipientFloor === 0) {
        return true;
    }

    // Nếu thiết bị chưa xác định tầng (chưa cấu hình tầng và tài khoản không gắn tầng)
    // -> Không phát bừa bãi ra tất cả các tầng!
    if (recipientFloor === null) {
        return false;
    }

    // Thiết bị PHẢI ở đúng tầng nhận hàng (targetFloor)
    return Number(recipientFloor) === Number(targetFloor);
}

/** Resolve a human-readable lift name from lift ID or raw value, using the store's lift list */
function getLiftName(targetLift: string, lifts: Lift[]): string {
    if (!targetLift || targetLift === 'ALL') return '';
    // Try to find by ID first
    const byId = lifts.find(l => l.id === targetLift);
    if (byId) return byId.lift_number.replace(/^Lift\s*/i, 'Tời ');
    // Try to find by lift_number
    const byName = lifts.find(l => l.lift_number === targetLift || isSameLift(l.id, targetLift));
    if (byName) return byName.lift_number.replace(/^Lift\s*/i, 'Tời ');
    // Fallback: strip non-numeric and prefix
    const num = String(targetLift).replace(/[^0-9]/g, '');
    return num ? `Tời ${num}` : String(targetLift);
}

/** Build a TTS prefix announcement string for floor/lift context */
function buildTtsPrefix(targetFloor: number, targetLift: string, lifts: Lift[]): string {
    const floorPart = targetFloor > 0 ? `Tầng ${targetFloor}` : '';
    const liftPart = getLiftName(targetLift, lifts);
    if (liftPart && floorPart) return `Thông báo. ${liftPart}, ${floorPart}. `;
    if (liftPart) return `Thông báo. ${liftPart}. `;
    if (floorPart) return `Thông báo. ${floorPart}. `;
    return 'Thông báo. ';
}

export function useAudioBroadcast() {
    const { user, assignment } = useAuthStore();
    const { notifications, lifts } = useLiftStore();
    const initialMarkedRef = useRef(false);
    const [, setStationFloorVer] = useState(0);

    // Lắng nghe sự kiện người dùng thay đổi trạm tầng thiết bị trên TopNav
    useEffect(() => {
        const handler = () => setStationFloorVer(v => v + 1);
        window.addEventListener('wlds_station_floor_changed', handler);
        window.addEventListener('storage', handler);
        return () => {
            window.removeEventListener('wlds_station_floor_changed', handler);
            window.removeEventListener('storage', handler);
        };
    }, []);

    // Initial mount: mark older historical notifications so only fresh ones speak
    useEffect(() => {
        if (!initialMarkedRef.current && notifications && notifications.length > 0) {
            const now = Date.now();
            notifications.forEach(n => {
                const t = new Date(n.created_at).getTime();
                if (isNaN(t) || now - t > 15000) {
                    playedNotificationIds.add(n.id);
                }
            });
            initialMarkedRef.current = true;
        }
    }, [notifications]);

    // 1. Cross-tab instant audio broadcast via BroadcastChannel
    useEffect(() => {
        if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

        const channel = new BroadcastChannel('wlds_audio_dispatch');

        const handleMessage = (event: MessageEvent) => {
            const { id, targetFloor = 0, targetLift = 'ALL', senderSessionId, text, timestamp } = event.data || {};
            if (!text || !id) return;

            // Skip if already played on this client instance
            if (playedNotificationIds.has(id)) return;
            playedNotificationIds.add(id);

            // Thêm dedup key theo nội dung và text snippet để tránh DB notification phát lại
            const snippet = text.substring(0, 50).trim();
            playedNotificationIds.add(`snippet_${snippet}`);

            const canPlay = shouldPlayForRecipient(
                Number(targetFloor) || 0,
                String(targetLift || 'ALL'),
                senderSessionId || '',
                user,
                assignment
            );

            if (canPlay) {
                const floorLabel = Number(targetFloor) > 0 ? `Tầng ${targetFloor}` : 'Kênh Chung';
                const resolvedLiftName = getLiftName(String(targetLift || 'ALL'), lifts);
                const liftLabel = resolvedLiftName ? ` - ${resolvedLiftName}` : '';

                toast.info(`🔊 Thông báo phát thanh (${floorLabel}${liftLabel}): ${text.substring(0, 80)}...`, { duration: 6000 });
                const ttsPrefix = buildTtsPrefix(Number(targetFloor) || 0, String(targetLift || 'ALL'), lifts);
                speakText(`${ttsPrefix}${text}`);
            }
        };

        channel.addEventListener('message', handleMessage);
        return () => {
            channel.removeEventListener('message', handleMessage);
            channel.close();
        };
    }, [user, assignment, lifts]);

    // 2. Cross-device database notification audio broadcast via Realtime / Polling
    useEffect(() => {
        // Chờ user load xong mới xử lý — tránh bỏ lỡ TTS khi assignment chưa có
        if (!notifications || notifications.length === 0) return;

        notifications.forEach((notif) => {
            if (!notif.message || playedNotificationIds.has(notif.id)) return;

            // Chỉ xử lý thông báo có tag [AUDIO_DISPATCH] hoặc title 'phát thanh' rõ ràng
            const isAudioDispatch =
                notif.message.includes('[AUDIO_DISPATCH') ||
                notif.title?.toLowerCase().includes('phát thanh');

            if (!isAudioDispatch) {
                playedNotificationIds.add(notif.id);
                return;
            }

            // Extract metadata: "[AUDIO_DISPATCH|F2|LIFT:L1|SENDER:u1] Message content"
            let targetFloor = (notif as any).target_floor || 0;
            let targetLift = (notif as any).target_lift || 'ALL';
            let cleanText = notif.message;

            const metaMatch = notif.message.match(/\[AUDIO_DISPATCH\|F(\d+)(?:\|LIFT:([^\|\]]+))?\|SENDER:([^\]]+)\]\s*(.*)/s);
            if (metaMatch) {
                targetFloor = parseInt(metaMatch[1], 10);
                targetLift = metaMatch[2] || 'ALL';
                cleanText = metaMatch[4];
            }

            // Đánh dấu id ngay để tránh xử lý lại
            playedNotificationIds.add(notif.id);

            // Kiểm tra dedup theo snippet nội dung để tránh phát lại nếu đã nghe qua BroadcastChannel
            const snippet = cleanText.substring(0, 50).trim();
            if (playedNotificationIds.has(`snippet_${snippet}`)) {
                return;
            }

            const canPlay = shouldPlayForRecipient(
                Number(targetFloor) || 0,
                String(targetLift || 'ALL'),
                '', // No session ID for DB notifications
                user,
                assignment
            );

            if (canPlay) {
                playedNotificationIds.add(`snippet_${snippet}`);
                const floorLabel = Number(targetFloor) > 0 ? `Tầng ${targetFloor}` : 'Kênh Chung';
                const resolvedLiftName = getLiftName(String(targetLift || 'ALL'), lifts);
                const liftLabel = resolvedLiftName ? ` - ${resolvedLiftName}` : '';

                toast.info(`🔊 Thông báo phát thanh (${floorLabel}${liftLabel}): ${cleanText.substring(0, 90)}...`, {
                    duration: 6000,
                });
                const ttsPrefix = buildTtsPrefix(Number(targetFloor) || 0, String(targetLift || 'ALL'), lifts);
                speakText(`${ttsPrefix}${cleanText}`);
            }
        });
    }, [notifications, user, assignment, lifts]);
}

