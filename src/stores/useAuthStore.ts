import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Assignment } from '../types';

interface AuthState {
  user: User | null;
  assignment: Assignment | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User | null) => void;
  setAssignment: (assignment: Assignment | null) => void;
  setLoading: (isLoading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      assignment: null,
      isAuthenticated: false,
      isLoading: true,
      setAuth: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),
      setAssignment: (assignment) => set({ assignment }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () => set({ user: null, assignment: null, isAuthenticated: false, isLoading: false }),
    }),
    {
      name: 'liftflow_auth_session',
      partialize: (state) => ({
        user: state.user,
        assignment: state.assignment,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

