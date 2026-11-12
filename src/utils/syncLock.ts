/**
 * syncLock.ts
 * Quản lý trạng thái thao tác cục bộ để tránh thiết bị tự gọi lại API (Self-Event Throttling)
 * khi nhận được Realtime WebSocket từ chính mình vừa tạo.
 *
 * Ngoài ra còn theo dõi trạng thái cục bộ của từng thang ngay sau khi thao tác,
 * để quá trình merge DB không ghi đè ngược lại trạng thái Optimistic UI còn mới.
 */

let _lastLocalActionTime = 0;

// Lưu trạng thái cục bộ tạm thời của từng thang sau khi người dùng thao tác
// Key: liftId, Value: { status, expireAt }
const _liftLocalStatus: Record<string, { status: string; expireAt: number }> = {};

export const markLocalAction = (durationMs = 2500) => {
  _lastLocalActionTime = Date.now() + durationMs;
};

export const isLocalActionActive = (): boolean => {
  return Date.now() < _lastLocalActionTime;
};

/**
 * Đánh dấu trạng thái cục bộ của một thang sau khi người dùng thao tác,
 * để ngăn polling DB kéo ngược lại trạng thái cũ trong thời gian chờ DB đồng bộ.
 */
export const markLiftLocalStatus = (liftId: string, status: string, durationMs = 10000) => {
  _liftLocalStatus[liftId] = { status, expireAt: Date.now() + durationMs };
};

/**
 * Trả về trạng thái cục bộ nếu vẫn còn hiệu lực, ngược lại trả về null.
 */
export const getLiftLocalStatus = (liftId: string): string | null => {
  const entry = _liftLocalStatus[liftId];
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    delete _liftLocalStatus[liftId];
    return null;
  }
  return entry.status;
};

