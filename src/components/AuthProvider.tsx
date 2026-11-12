import React, { useEffect } from 'react';
import { getSupabase } from '../api/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { Loader2 } from 'lucide-react';
import { User, Assignment } from '../types';
import { db, isSupabaseConfigured, syncGoogleSheetData } from '../api/dbClient';
import { isGoogleSheetConfigured } from '../config/sheetConfig';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setAuth, setAssignment, setLoading, isLoading, user: currentUser } = useAuthStore();

  useEffect(() => {
    let mounted = true;

    const fetchSession = async () => {
      try {
        if (isGoogleSheetConfigured()) {
          try {
            await syncGoogleSheetData();
          } catch (e) {
            console.warn('[AuthProvider] Sheet initial sync warn:', e);
          }
        }

        if (isSupabaseConfigured()) {
          const supabase = getSupabase();
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();

          if (!sessionError && session?.user) {
            let userData: User | null = null;
            try {
              // Retrieve user from 'users' table
              const allUsers = await db.users.getAll();
              const allRoles = await db.roles.getAll();

              let matched = allUsers.find(u =>
                u.id === session.user.id ||
                (u.email && session.user.email && String(u.email).toLowerCase() === session.user.email.toLowerCase()) ||
                (u.employee_code && session.user.email && session.user.email.toLowerCase().includes(String(u.employee_code).toLowerCase()))
              );

              if (matched) {
                const roleObj = allRoles.find(r => r.id === matched!.role_id);
                let roleName: 'Admin' | 'Supervisor' | 'Worker' = 'Worker';
                if (roleObj) {
                  const n = roleObj.role_name.toLowerCase();
                  if (n.includes('admin')) roleName = 'Admin';
                  else if (n.includes('super')) roleName = 'Supervisor';
                }

                userData = {
                  id: matched.id,
                  email: `${matched.employee_code || matched.id}@liftflow.local`,
                  full_name: matched.full_name,
                  employee_code: matched.employee_code || undefined,
                  phone: matched.phone || undefined,
                  role: roleName,
                  created_at: matched.created_at,
                  updated_at: matched.created_at,
                };
              }
            } catch (e) {
              console.log('Error fetching from users table:', e);
            }

            if (userData && mounted) {
              setAuth(userData);
            }
          }
        }

        // Fetch assignment for current user if logged in
        const activeUser = useAuthStore.getState().user;
        if (activeUser && mounted) {
          try {
            const [assignments, dbFloors] = await Promise.all([
              db.dailyAssignments.getAll(),
              db.floors.getAll().catch(() => [])
            ]);
            const today = new Date().toISOString().split('T')[0];
            const myAssignment = assignments
              .filter(a => a.user_id === activeUser.id || a.user_id === activeUser.employee_code)
              .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

            if (myAssignment) {
              let assignedFloor = 1;
              if (myAssignment.floor_id) {
                const strFloor = String(myAssignment.floor_id);
                const matchedDbFloor = dbFloors.find(f => f.id === strFloor);
                if (matchedDbFloor) {
                  assignedFloor = matchedDbFloor.floor_no;
                } else if (strFloor.includes('22222222') || strFloor.includes('f2') || strFloor === '2') {
                  assignedFloor = 2;
                } else if (strFloor.includes('33333333') || strFloor.includes('f3') || strFloor === '3') {
                  assignedFloor = 3;
                } else if (strFloor.includes('44444444') || strFloor.includes('f4') || strFloor === '4') {
                  assignedFloor = 4;
                } else {
                  const num = parseInt(strFloor.replace(/[^0-9]/g, ''), 10);
                  if (!isNaN(num) && num > 0 && num <= 10) assignedFloor = num;
                }
              }

              setAssignment({
                id: myAssignment.id,
                user_id: myAssignment.user_id,
                lift_id: myAssignment.lift_id,
                assigned_floor: assignedFloor,
                work_date: myAssignment.work_date || today,
                created_at: myAssignment.created_at,
                updated_at: myAssignment.created_at,
              });
            }
          } catch (e) {
            console.warn('Error fetching daily assignment:', e);
          }
        }
      } catch (error) {
        console.error('Error in AuthProvider session fetch:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchSession();

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          setLoading(true);
          fetchSession();
        } else if (event === 'SIGNED_OUT') {
          setAuth(null);
          setAssignment(null);
        }
      });

      return () => {
        mounted = false;
        subscription.unsubscribe();
      };
    } else {
      setLoading(false);
    }
  }, [setAuth, setAssignment, setLoading]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="mt-4 text-slate-500 dark:text-slate-400 font-medium">Đang tải cấu hình...</p>
      </div>
    );
  }

  return <>{children}</>;
}
