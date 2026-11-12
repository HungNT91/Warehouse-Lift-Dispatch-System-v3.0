// Database Table Interfaces matching the database schema diagrams

export interface DbRole {
  id: number; // int8
  role_name: string; // varchar
  description?: string | null; // text
  created_at: string; // timestamp
}

export interface DbUser {
  id: string; // uuid
  employee_code?: string | null; // varchar
  full_name: string; // varchar
  email?: string | null; // varchar
  telegram_id?: string | null; // varchar
  phone?: string | null; // varchar
  role_id?: number | null; // int8
  floor_id?: string | null; // uuid
  active: boolean; // bool
  created_at: string; // timestamptz
  password?: string | null;
}

export interface DbUserDevice {
  id: string; // uuid
  user_id: string; // uuid
  device_name?: string | null; // varchar
  device_type?: string | null; // varchar
  browser?: string | null; // text
  push_token?: string | null; // text
  last_login?: string | null; // timestamp
  active: boolean; // bool
}

export interface DbFloor {
  id: string; // uuid
  floor_no: number; // int4
  floor_name?: string | null; // varchar
  created_at: string; // timestamp
}

export interface DbLiftStatus {
  id: number; // int8
  status_code: string; // varchar
  status_name: string; // varchar
  color?: string | null; // varchar
}

export interface DbLift {
  id: string; // uuid
  lift_code?: string | null; // varchar
  lift_name?: string | null; // varchar
  current_floor?: string | null; // uuid
  status_id?: number | null; // int8
  has_cargo?: boolean | null; // bool
  current_job?: string | null; // uuid
  last_update?: string | null; // timestamp
  note?: string | null; // text
  current_assignment_id?: string | null; // uuid
  lock_type?: string | null; // varchar
  allowed_floors?: number[]; // jsonb / array
  restricted_by_user_id?: string | null;
  restricted_by_name?: string | null;
  restricted_at?: string | null;
  restriction_date?: string | null;
  pickup_start_time?: number | string | null;
  source_floor?: number | string | null;
}

export interface DbLiftCommand {
  id: string; // uuid
  lift_id: string; // uuid
  command: string; // varchar
  payload?: Record<string, any> | null; // jsonb
  status?: string | null; // varchar
  created_by?: string | null; // uuid
  created_at: string; // timestamp
  executed_at?: string | null; // timestamp
}

export interface DbLiftReservation {
  id: string; // uuid
  lift_id: string; // uuid
  from_floor_id: string; // uuid
  to_floor_id: string; // uuid
  reserved_by?: string | null; // uuid
  start_time?: string | null; // timestamp
  end_time?: string | null; // timestamp
  reason?: string | null; // text
  active?: boolean | null; // bool
  created_at: string; // timestamp
}

export interface DbDailyAssignment {
  id: string; // uuid
  work_date: string; // date
  user_id: string; // uuid
  floor_id: string; // uuid
  lift_id: string; // uuid
  shift?: string | null; // varchar
  created_at: string; // timestamp
}

export interface DbTransportJob {
  id: string; // uuid
  job_no?: string | null; // varchar
  lift_id?: string | null; // uuid
  from_floor?: string | null; // uuid
  to_floor?: string | null; // uuid
  sender_id?: string | null; // uuid
  receiver_id?: string | null; // uuid
  status?: string | null; // varchar
  created_at: string; // timestamp
  moving_at?: string | null; // timestamp
  arrived_at?: string | null; // timestamp
  picked_up_at?: string | null; // timestamp
  completed_at?: string | null; // timestamp
  remark?: string | null; // text
  reservation_id?: string | null; // uuid
}

export interface DbJobTimeline {
  id: string; // uuid
  job_id: string; // uuid
  status: string; // varchar
  action_by?: string | null; // uuid
  action_time: string; // timestamp
  remark?: string | null; // text
}

export interface DbTelegramLog {
  id: number; // int8
  job_id?: string | null; // uuid
  user_id?: string | null; // uuid
  telegram_chat_id?: string | null; // varchar
  message?: string | null; // text
  status?: string | null; // varchar
  sent_time: string; // timestamp
}

export interface DbActivityLog {
  id: number; // int8
  user_id?: string | null; // uuid
  action?: string | null; // varchar
  table_name?: string | null; // varchar
  record_id?: string | null; // uuid
  description?: string | null; // text
  created_at: string; // timestamp
  event_type?: string | null; // varchar
}

export interface DbSystemSetting {
  id: number; // int8
  setting_group?: string | null; // varchar
  setting_key?: string | null; // varchar
  setting_value?: string | null; // text
  value_type?: string | null; // varchar
  description?: string | null; // text
  updated_at: string; // timestamp
  updated_by?: string | null; // uuid
}

export interface DbNotification {
  id: string; // uuid
  job_id?: string | null; // uuid
  notification_type?: string | null; // varchar
  receiver_id?: string | null; // uuid
  title?: string | null; // text
  message?: string | null; // text
  status?: string | null; // varchar
  created_at: string; // timestamp
  sent_at?: string | null; // timestamp
}

// Database Schema Map
export interface DatabaseSchema {
  roles: DbRole;
  users: DbUser;
  user_devices: DbUserDevice;
  floors: DbFloor;
  lift_status: DbLiftStatus;
  lifts: DbLift;
  lift_commands: DbLiftCommand;
  lift_reservations: DbLiftReservation;
  daily_assignments: DbDailyAssignment;
  transport_jobs: DbTransportJob;
  job_timeline: DbJobTimeline;
  telegram_logs: DbTelegramLog;
  activity_logs: DbActivityLog;
  system_settings: DbSystemSetting;
  notifications: DbNotification;
}
