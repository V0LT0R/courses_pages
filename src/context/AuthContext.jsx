import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ensureSupabaseConfigured, supabase, withTimeout } from '../lib/supabase';
import { getCurrentProfile, isEmailTaken, updateMyProfile } from '../lib/courseService';

const AuthContext = createContext(null);

function buildFallbackProfile(authUser) {
  if (!authUser) return null;
  return {
    id: authUser.id,
    name: authUser.user_metadata?.full_name || authUser.user_metadata?.fullName || authUser.email,
    fullName: authUser.user_metadata?.full_name || authUser.user_metadata?.fullName || authUser.email,
    email: authUser.email,
    role: authUser.app_metadata?.role || authUser.user_metadata?.role || 'student',
    organization: '',
    phone: '',
    createdAt: authUser.created_at,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (fallbackAuthUser = null) => {
    try {
      const profile = await getCurrentProfile();
      const finalProfile = profile || buildFallbackProfile(fallbackAuthUser);
      setUser(finalProfile);
      return finalProfile;
    } catch (err) {
      console.error('Profile load error:', err);
      const fallback = buildFallbackProfile(fallbackAuthUser);
      setUser(fallback);
      return fallback;
    }
  };

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        ensureSupabaseConfigured();
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data.session?.user) {
          await loadProfile(data.session.user);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth init error:', err);
        setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    init();

    // ВАЖНО: внутри onAuthStateChange нельзя await-ить другие Supabase-запросы.
    // Иначе вход может зависнуть на состоянии "Входим..." из-за внутреннего auth lock.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(buildFallbackProfile(session.user));
      setLoading(false);

      setTimeout(() => {
        if (active) loadProfile(session.user);
      }, 0);
    });

    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isAdmin: user?.role === 'admin',
    isManager: user?.role === 'manager',
    isStudent: user?.role === 'student',
    canManageSeminars: user?.role === 'admin' || user?.role === 'manager',
    isAuthenticated: Boolean(user),
    async login(email, password) {
      ensureSupabaseConfigured();
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: String(email || '').toLowerCase().trim(),
          password,
        }),
        'Supabase Auth не отвечает. Проверьте интернет, ключи в .env и что проект Supabase активен.'
      );
      if (error) throw new Error(error.message || 'Не удалось войти.');
      return loadProfile(data.user);
    },
    async registerStudent({ fullName, email, password }) {
      ensureSupabaseConfigured();
      const normalizedEmail = String(email || '').toLowerCase().trim();
      const taken = await isEmailTaken(normalizedEmail);
      if (taken) {
        throw new Error('Пользователь с таким email уже зарегистрирован.');
      }

      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        }),
        'Supabase Auth не отвечает. Проверьте интернет, ключи в .env и что проект Supabase активен.'
      );

      if (error) throw new Error(error.message || 'Не удалось зарегистрироваться.');

      if (!data.session) {
        throw new Error('Аккаунт создан, но вход не выполнен. Отключите подтверждение email в Supabase Auth или войдите через форму входа.');
      }

      return loadProfile(data.user);
    },
    async saveProfile(profileForm) {
      const updated = await updateMyProfile(profileForm);
      setUser(updated);
      return updated;
    },
    async logout() {
      await supabase.auth.signOut();
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
