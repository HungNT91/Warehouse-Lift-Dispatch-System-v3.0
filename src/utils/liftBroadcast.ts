import { speakText } from './audio';
import { db } from '../api/dbClient';
import { useLiftStore } from '../stores/useLiftStore';
import { useAuthStore } from '../stores/useAuthStore';
import { toast } from 'sonner';
import { playedNotificationIds, shouldPlayForRecipient } from '../hooks/useAudioBroadcast';

/** Recent arrival cache: map key `${liftId}-f${destFloor}` -> timestamp to prevent duplicate announcements */
const recentArrivals = new Map<string, number>();

/** Session ID helper */
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

/** Check if two lift values refer to the same lift */
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
 * Phát thanh thông báo khi thang tời cập bến tầng đích qua toàn bộ hệ thống (BroadcastChannel + DB Realtime/Polling + Local TTS)
 */
export function broadcastLiftArrival(
  liftId: string,
  liftNumber: string,
  destFloor: number,
  isCargoArrival: boolean = true
) {
  const normFloor = Number(destFloor) || 1;
  const dedupKey = `${liftId}-f${normFloor}`;
  const now = Date.now();
  const lastTime = recentArrivals.get(dedupKey) || 0;

  // Chặn phát lặp lại cùng một thang đến cùng một tầng trong vòng 15 giây
  if (now - lastTime < 15000) {
    return;
  }
  recentArrivals.set(dedupKey, now);

  const cleanLift = liftNumber ? liftNumber.replace(/^Lift\s*/i, 'Tời ').replace(/^Thang\s*/i, 'Tời ') : `Tời ${liftId}`;
  const messageText = isCargoArrival
    ? `Thông báo, ${cleanLift} đã vận chuyển hàng đến Tầng ${normFloor}. Yêu cầu nhân viên kho Tầng ${normFloor} kiểm tra kéo hàng!`
    : `Thông báo, ${cleanLift} đã đến Tầng ${normFloor} và sẵn sàng phục vụ!`;

  const senderSessionId = getSessionId();
  const notifId = `arr-${liftId}-${normFloor}-${now}`;

  // Đánh dấu snippet ngay lập tức vào dedup set để không bị phát đúp
  const snippet = messageText.substring(0, 50).trim();
  playedNotificationIds.add(notifId);
  playedNotificationIds.add(`snippet_${snippet}`);

  // 1. Phát qua BroadcastChannel tới tất cả các tab khác trên cùng trình duyệt
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('wlds_audio_dispatch');
      bc.postMessage({
        id: notifId,
        targetFloor: normFloor,
        targetLift: liftId,
        senderSessionId,
        text: messageText,
        timestamp: now
      });
      setTimeout(() => {
        try { bc.close(); } catch { }
      }, 2000);
    } catch (e) {
      console.warn('BroadcastChannel arrival broadcast error:', e);
    }
  }

  // 2. Ghi Notification vào Database để đồng bộ qua các thiết bị khác (Worker điện thoại, màn hình kho...)
  const notifTitle = `🔔 Cập Bến: ${cleanLift} - Tầng ${normFloor}`;
  const formattedMessage = `[AUDIO_DISPATCH|F${normFloor}|LIFT:${liftId}|SENDER:system] ${messageText}`;

  db.notifications.create({
    notification_type: `AUDIO_DISPATCH_F${normFloor}_${liftId}`,
    title: notifTitle,
    message: formattedMessage,
    status: 'SENT'
  }).catch(console.error);

  // 3. Thêm thông báo vào store cục bộ
  useLiftStore.setState(state => ({
    notifications: [{
      id: notifId,
      title: notifTitle,
      message: formattedMessage,
      severity: 'info' as const,
      category: 'system' as const,
      is_read: false,
      created_at: new Date().toISOString(),
      link_id: liftId
    }, ...state.notifications]
  }));

  // 4. Kiểm tra phát âm thanh TTS tại chính thiết bị/tab hiện tại
  // NGUYÊN TẮC: CHỈ PHÁT NẾU THIẾT BỊ NÀY THỰC SỰ LÀ THIẾT BỊ TẦNG NHẬN HÀNG (normFloor)!
  // Nếu máy tính này ở tầng khác (ví dụ Tầng gửi hàng hay phòng điều hành tầng khác),
  // chỉ hiển thị Toast trực quan, TUYỆT ĐỐI KHÔNG PHÁT ÂM THANH!
  const { user, assignment } = useAuthStore.getState();
  const canSpeakHere = shouldPlayForRecipient(normFloor, liftId, '', user, assignment);

  // Toast luôn hiển thị cho người vận hành biết trạng thái thang
  toast.info(`🔔 ${notifTitle}`, { duration: 5000 });

  if (canSpeakHere) {
    speakText(messageText);
  }
}
