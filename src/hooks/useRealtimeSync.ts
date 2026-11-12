/**
 * useRealtimeSync.ts
 *
 * Cơ chế cập nhật dữ liệu tự động tối ưu hóa 2 lớp:
 *  - Layer 1 (Primary): Supabase Realtime WebSocket — cập nhật tức thì với Debounce 800ms
 *  - Layer 2 (Fallback): Heartbeat 60s khi Realtime đang chạy, hoặc Polling 25s khi WebSocket gặp lỗi/mất kết nối
 *  - Self-Action Throttling: Bỏ qua re-fetch khi thiết bị hiện tại vừa thực hiện thao tác (vì state đã cập nhật Optimistic UI)
 *
 * Trạng thái kết nối được lưu vào useLiftStore.syncStatus để UI hiển thị chính xác.
 */

import { useEffect, useRef } from 'react';
import { useLiftStore } from '../stores/useLiftStore';
import { useAuthStore } from '../stores/useAuthStore';
import { isSupabaseConfigured, syncGoogleSheetData } from '../api/dbClient';
import { isGoogleSheetConfigured } from '../config/sheetConfig';
import { getSupabase } from '../api/supabase';
import { isLocalActionActive } from '../utils/syncLock';

const FALLBACK_POLL_INTERVAL_MS = 25_000; // 25s khi mất kết nối Realtime
const REALTIME_HEARTBEAT_MS = 60_000;      // 60s heartbeat đồng bộ định kỳ khi Realtime bình thường

/** Module-level singletons — tránh đăng ký trùng khi component re-render */
let _channels: any[] = [];
let _pollingTimer: ReturnType<typeof setInterval> | null = null;
let _delayTimer: ReturnType<typeof setTimeout> | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _currentPollInterval = FALLBACK_POLL_INTERVAL_MS;
let _initialized = false;
let _pendingWithLogs = false; // Tích lũy: bất kỳ event nào yêu cầu logs → fetch logs trong batch tiếp theo

export function useRealtimeSync() {
  const { fetchInitialData, fetchDynamicData, setSyncStatus, checkAndResetExpiredRestrictions } = useLiftStore();
  const { isAuthenticated } = useAuthStore();
  const refreshingRef = useRef(false);

  const refresh = async (onlyDynamic = false) => {
    if (refreshingRef.current) return; // Chặn gọi song song chồng chéo
    refreshingRef.current = true;
    try {
      if (onlyDynamic) {
        await fetchDynamicData();
      } else {
        await fetchInitialData();
      }
      checkAndResetExpiredRestrictions();
      setSyncStatus(
        isGoogleSheetConfigured() || _channels.length > 0 ? 'realtime' : 'polling',
        new Date()
      );
    } catch (e) {
      console.error('[RealtimeSync] Lỗi đồng bộ dữ liệu:', e);
    } finally {
      refreshingRef.current = false;
    }
  };

  // Gom nhiều event dồn dập (ví dụ khi tạo đơn có 3 table cùng insert) thành 1 lần refresh duy nhất
  // withLogs=true khi event INSERT vào notifications/activity_logs — cần fetch thêm 2 bảng đó
  const scheduleDebouncedRefresh = (withLogs = false) => {
    if (withLogs) _pendingWithLogs = true; // Tích lũy: nếu bất kỳ event nào yêu cầu logs → fetch logs
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      _debounceTimer = null;
      const needLogs = _pendingWithLogs;
      _pendingWithLogs = false;
      // Nếu thao tác do chính thiết bị này vừa thực hiện -> state local đã cập nhật tức thì, không cần fetch lại
      if (isLocalActionActive()) {
        return;
      }
      // Truyền includeLogs để chỉ fetch notifications/activities khi thực sự có event mới
      fetchDynamicData(needLogs);
    }, 400);
  };

  useEffect(() => {
    if (!isAuthenticated || _initialized) return;
    _initialized = true;

    // Fetch toàn bộ dữ liệu lần đầu khi user đăng nhập (thay thế useEffect trùng ở App.tsx)
    refresh(false);

    if (isGoogleSheetConfigured()) {
      console.info('[RealtimeSync] ✅ Đã kết nối Google Sheet → Đồng bộ tự động chu kỳ 6s.');
      setSyncStatus('realtime', new Date());
      syncGoogleSheetData().then(() => {
        refresh(false);
      });
      _startGoogleSheetPolling();
      return;
    }

    if (!isSupabaseConfigured()) {
      console.info('[RealtimeSync] Supabase chưa cấu hình → Polling dự phòng 25s.');
      setSyncStatus('polling');
      // Polling bắt đầu sau 25s vì vừa fetch xong ở trên
      _delayTimer = setTimeout(() => {
        _delayTimer = null;
        _startPolling(FALLBACK_POLL_INTERVAL_MS);
      }, FALLBACK_POLL_INTERVAL_MS);
      return;
    }

    setSyncStatus('connecting');
    // Bắt đầu đăng ký Realtime — polling sẽ khởi động ở callback SUBSCRIBED hoặc khi gặp lỗi
    // Không startPolling ngay lập tức ở đây để tránh fetch 2 lần cùng lúc khi khởi động
    _startRealtimeSubscriptions();

    return () => {
      _stopRealtimeSubscriptions();
      _stopPolling();
      if (_delayTimer) {
        clearTimeout(_delayTimer);
        _delayTimer = null;
      }
      if (_debounceTimer) {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
      }
      _initialized = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ─────────────────────────────────────────────
  // LAYER 1: Supabase Realtime WebSocket (Debounced)
  // ─────────────────────────────────────────────
  function _startRealtimeSubscriptions() {
    if (_channels.length > 0) return;
    try {
      const supabase = getSupabase();

      const tables: { name: string; event: string; withLogs: boolean }[] = [
        { name: 'lifts', event: '*', withLogs: false },
        { name: 'transport_jobs', event: '*', withLogs: false },
        { name: 'notifications', event: 'INSERT', withLogs: true },
        { name: 'activity_logs', event: 'INSERT', withLogs: true },
        { name: 'daily_assignments', event: '*', withLogs: false },
      ];

      let subscribedCount = 0;

      tables.forEach(({ name, event, withLogs }) => {
        const ch = supabase
          .channel(`realtime_wlds:${name}`)
          .on(
            'postgres_changes' as any,
            { event, schema: 'public', table: name },
            () => {
              // Mọi event đều qua debounced refresh và chỉ fetch dynamic data khi không phải self-action
              scheduleDebouncedRefresh(withLogs);
            }
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              subscribedCount++;
              if (subscribedCount >= tables.length) {
                setSyncStatus('realtime', new Date());
                console.info('[RealtimeSync] ✅ Realtime WebSocket kết nối thành công. Chuyển Polling sang chế độ Heartbeat 60s.');
                // Giảm tần suất polling xuống 60s để tiết kiệm API tối đa khi Realtime hoạt động tốt
                _startPolling(REALTIME_HEARTBEAT_MS);
              }
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn(`[RealtimeSync] ⚠️ Channel ${name} gặp sự cố → Chuyển sang Polling dự phòng 25s.`);
              setSyncStatus('polling');
              _startPolling(FALLBACK_POLL_INTERVAL_MS);
            }
          });

        _channels.push(ch);
      });
    } catch (err) {
      console.error('[RealtimeSync] Không thể khởi tạo Realtime:', err);
      setSyncStatus('polling');
      _startPolling(FALLBACK_POLL_INTERVAL_MS);
    }
  }

  function _stopRealtimeSubscriptions() {
    try {
      if (!isSupabaseConfigured() || _channels.length === 0) return;
      const supabase = getSupabase();
      _channels.forEach((ch) => supabase.removeChannel(ch));
    } catch { /* ignore */ }
    _channels = [];
  }

  // ─────────────────────────────────────────────
  // LAYER 2: Heartbeat & Fallback Polling
  // ─────────────────────────────────────────────
  function _startPolling(intervalMs: number) {
    if (_pollingTimer && _currentPollInterval === intervalMs) return;
    _stopPolling();
    _currentPollInterval = intervalMs;
    _pollingTimer = setInterval(() => { fetchDynamicData(false); }, intervalMs);
    console.info(`[RealtimeSync] 🔄 Polling thiết lập chu kỳ: ${intervalMs / 1000}s.`);
  }

  function _startGoogleSheetPolling(intervalMs: number = 6_000) {
    if (_pollingTimer) {
      clearInterval(_pollingTimer);
      _pollingTimer = null;
    }
    _currentPollInterval = intervalMs;
    _pollingTimer = setInterval(async () => {
      // Bỏ qua nếu có thao tác local đang diễn ra
      if (isLocalActionActive()) return;
      try {
        const synced = await syncGoogleSheetData();
        if (synced) {
          await fetchDynamicData(true);
          checkAndResetExpiredRestrictions();
          setSyncStatus('realtime', new Date());
        }
      } catch (e) {
        console.warn('[RealtimeSync] Lỗi poll Google Sheet:', e);
      }
    }, intervalMs);
    console.info(`[RealtimeSync] 🟢 Google Sheet Polling thiết lập chu kỳ: ${intervalMs / 1000}s.`);
  }

  function _stopPolling() {
    if (_pollingTimer) {
      clearInterval(_pollingTimer);
      _pollingTimer = null;
    }
  }
}
