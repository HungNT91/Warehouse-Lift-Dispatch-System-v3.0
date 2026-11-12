export * from './database';

export type Role = 'Worker' | 'Supervisor' | 'Admin';

export type User = {
  id: string;
  email: string;
  full_name: string;
  name?: string;
  employee_code?: string;
  phone?: string;
  role: Role;
  created_at: string;
  updated_at: string;
};

export type LiftStatus =
  | 'AVAILABLE'
  | 'WAITING_PICKUP'
  | 'MOVING'
  | 'RESERVED'
  | 'LOCKED'
  | 'OFFLINE'
  | 'MAINTENANCE'
  | 'STOPPED';

export type Lift = {
  id: string;
  lift_code?: string | null;
  lift_number: string;
  current_floor: number;
  destination_floor: number | null;
  status: LiftStatus;
  operator: string | null;
  current_job_id: string | null;
  elapsed_time: string | null;
  last_update: string;
  progress: number;
  source_floor?: number | null;
  pickup_start_time?: number | null;
  allowed_floors?: number[];
  restricted_by_user_id?: string | null;
  restricted_by_name?: string | null;
  restricted_at?: string | null;
  restriction_date?: string | null;
  created_at: string;
  updated_at: string;
};

export type JobPriority = 'NORMAL' | 'HIGH' | 'URGENT';

export type JobStatus =
  | 'CREATED'
  | 'MOVING'
  | 'IN_PROGRESS'
  | 'WAITING_PICKUP'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED';

export type Job = {
  id: string;
  code?: string;
  lift_id: string;
  lift_number?: string;
  created_by: string;
  creator_name?: string;
  source_floor: number;
  target_floor: number;
  status: JobStatus;
  priority?: JobPriority;
  item_type?: string;
  quantity?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
};

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  category: 'lift' | 'job' | 'system' | 'uncollected';
  is_read: boolean;
  created_at: string;
  link_id?: string;
};

export type Assignment = {
  id: string;
  user_id: string;
  lift_id: string;
  assigned_floor: number;
  assigned_date?: string;
  work_date?: string;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  user_id: string;
  action: string;
  entity: string;
  entity_id: string;
  description: string;
  created_at: string;
};

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export interface Floor {
  level: number;
  waiting_jobs: number;
  assigned_employee: string;
  current_lift: string | null;
  waiting_duration: string | null;
}
