import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ensureSupabaseConfigured, supabase, withTimeout } from '../lib/supabase';
import { getCurrentProfile, updateMyProfile, clearCourseCache } from '../lib/courseService';
import { userMessage } from '../lib/errors';
import { normalizeEmail, validateStudentRegistration } from '../lib/security';

const AuthContext = createContext(null);

function buildFallbackProfile(authUser) {
  if (!authUser) return null;
  return {
    id: authUser.id,
    name: authUser.user_metadata?.full_name || authUser.user_metadata?.fullName || authUser.email,
    fullName: authUser.user_metadata?.full_name || authUser.user_metadata?.fullName || authUser.email,
    email: authUser.email,
    role: 'student',
    organization: '',
    phone: '',
    createdAt: authUser.created_at,
  };
}

export function AuthProvider({ children }) {
  const generation = useRef(0);
  const mounted = useRef(true);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (fallbackAuthUser = null) => {
    const current = ++generation.current;
    try {
      const profile = await getCurrentProfile();
      const {data:{session}}=await supabase.auth.getSession();
      const finalProfile = session?.user ? (profile?.id===session.user.id?profile:buildFallbackProfile(session.user)) : null;
      if(mounted.current && current===generation.current)setUser(finalProfile);
      return finalProfile;
    } catch (err) {
      console.error('Profile load error:', err);
      const {data:{session}}=await supabase.auth.getSession();
      const fallback = buildFallbackProfile(session?.user);
      if(mounted.current && current===generation.current)setUser(fallback);
      return fallback;
    }
  };

  useEffect(() => {
    let active = true;
    mounted.current=true;

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

      generation.current++;
      clearCourseCache();
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(previous=>previous?.id===session.user.id?previous:buildFallbackProfile(session.user));
      setLoading(false);

      setTimeout(() => {
        if (active) loadProfile(session.user);
      }, 0);
    });

    return () => {
      active = false;
      mounted.current=false;
      generation.current++;
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
          email: normalizeEmail(email),
          password,
        }),
        'Supabase Auth не отвечает. Проверьте интернет, ключи в .env и что проект Supabase активен.'
      );
      if (error) throw new Error(userMessage(error));
      return loadProfile(data.user);
    },
    async registerStudent({ fullName, email, password }) {
      ensureSupabaseConfigured();
      const validated = validateStudentRegistration({ fullName, email, password });
      if (validated.errors.length) throw new Error(validated.errors[0]);

      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email: validated.email,
          password: validated.password,
          options: {
            data: {
              full_name: validated.fullName,
            },
          },
        }),
        'Supabase Auth не отвечает. Проверьте интернет, ключи в .env и что проект Supabase активен.'
      );

      if (error) {
        const duplicateLike = /already|registered|exists/i.test(error.message || '');
        throw new Error(duplicateLike
          ? 'Не удалось создать новый аккаунт. Если этот email уже использовался, войдите через форму входа.'
          : (error.message || 'Не удалось зарегистрироваться.'));
      }
      if (!data.user || data.user.identities?.length === 0) {
        throw new Error('Не удалось создать новый аккаунт. Если этот email уже использовался, войдите через форму входа.');
      }

      if (!data.session) {
        throw new Error('Аккаунт создан. Подтвердите email, если подтверждение включено, затем войдите через форму входа.');
      }

      return loadProfile(data.user);
    },
    async saveProfile(profileForm) {
      const updated = await updateMyProfile(profileForm);
      setUser(updated);
      return updated;
    },
    async logout() {
      generation.current++;
      clearCourseCache();
      const {error}=await supabase.auth.signOut();
      if(error)throw new Error(userMessage(error));
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
