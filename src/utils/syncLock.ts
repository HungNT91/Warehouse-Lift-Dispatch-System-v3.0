/**
 * syncLock.ts
 * Quản lý trạng thái thao tác cục bộ để tránh thiết bị tự gọi lại API (Self-Event Throttling)
 * khi nhận được Realtime WebSocket từ chính mình vừa tạo.
 */

let _lastLocalActionTime = 0;

export const markLocalAction = (durationMs = 2500) => {
  _lastLocalActionTime = Date.now() + durationMs;
};

export const isLocalActionActive = (): boolean => {
  return Date.now() < _lastLocalActionTime;
};

