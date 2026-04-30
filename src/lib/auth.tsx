import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

type Role = "admin" | "atendente";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  role: Role | null;
  nomeCompleto: string | null;
  loading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [nomeCompleto, setNomeCompleto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadProfile(sess.user.id), 0);
      } else {
        setRole(null);
        setNomeCompleto(null);
        setLoading(false);
      }
    });
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) loadProfile(sess.user.id);
      else setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadProfile(uid: string) {
    const [{ data: rolesData }, { data: profileData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid).order("role", { ascending: true }),
      supabase.from("profiles").select("nome_completo").eq("id", uid).maybeSingle(),
    ]);
    const roles = (rolesData ?? []).map((r) => r.role);
    setRole(roles.includes("admin") ? "admin" : roles.includes("atendente") ? "atendente" : null);
    setNomeCompleto(profileData?.nome_completo ?? null);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setRole(null);
    setNomeCompleto(null);
  }

  return (
    <Ctx.Provider
      value={{
        user, session, role, nomeCompleto, loading,
        isStaff: !!role,
        isAdmin: role === "admin",
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
