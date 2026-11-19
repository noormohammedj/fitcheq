// admin-users: lets a gym admin create logins for trainers and members, reset passwords and
// switch accounts on or off. Only callers whose profile is an active admin may use it, and only
// inside their own gym. Logins are phone number + password; the phone is mapped to an internal email.
import { createClient } from "npm:@supabase/supabase-js@2";

const LOGIN_DOMAIN = "login.fitcheq.inraasolution.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const phone10 = (p: unknown) => String(p ?? "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: who } = await service.auth.getUser(jwt);
  if (!who?.user) return json({ error: "Please sign in again" }, 401);
  const { data: me } = await service.from("fq_profiles").select("gym_id, role, active").eq("id", who.user.id).single();
  if (!me || me.role !== "admin" || !me.active) return json({ error: "Only the gym owner can do this" }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }

  // the target account must belong to the caller's gym
  const sameGym = async (id: string) => {
    const { data } = await service.from("fq_profiles").select("gym_id").eq("id", id).single();
    return data?.gym_id === me.gym_id;
  };

  if (body.action === "create_user") {
    const role = body.role, phone = phone10(body.phone), name = String(body.full_name ?? "").trim(), password = String(body.password ?? "");
    if (!["trainer", "member", "admin"].includes(role)) return json({ error: "Choose trainer or member" }, 400);
    if (phone.length !== 10) return json({ error: "Enter a 10-digit mobile number" }, 400);
    if (!name) return json({ error: "Enter a name" }, 400);
    if (password.length < 8) return json({ error: "Password needs at least 8 characters" }, 400);

    const { data: created, error } = await service.auth.admin.createUser({
      email: `${phone}@${LOGIN_DOMAIN}`, password, email_confirm: true, user_metadata: { full_name: name, phone },
    });
    if (error || !created.user) return json({ error: /registered|exists/i.test(error?.message ?? "") ? "This mobile number already has a login" : "Could not create the login" }, 400);
    const id = created.user.id;
    const undo = async (msg: string) => { await service.auth.admin.deleteUser(id); return json({ error: msg }, 400); };

    const p = await service.from("fq_profiles").insert({ id, gym_id: me.gym_id, role, full_name: name, phone });
    if (p.error) return undo("Could not save the profile");
    if (role === "trainer") {
      const t = body.trainer ?? {};
      const r = await service.from("fq_trainers").insert({ profile_id: id, gym_id: me.gym_id, speciality: t.speciality ?? null, experience_years: t.experience_years ?? null, certifications: t.certifications ?? null, bio: t.bio ?? null, slots: t.slots ?? null });
      if (r.error) return undo("Could not save trainer details");
    }
    if (role === "member") {
      const m = body.member ?? {};
      const w = m.start_weight ? Number(m.start_weight) : null;
      const r = await service.from("fq_members").insert({
        profile_id: id, gym_id: me.gym_id, trainer_id: m.trainer_id || null, diet_type: m.diet_type === "nonveg" ? "nonveg" : "veg",
        goal: ["lose", "gain", "fit"].includes(m.goal) ? m.goal : "lose", start_weight: w, current_weight: w,
        target_weight: m.target_weight ? Number(m.target_weight) : null, height_cm: m.height_cm ? Number(m.height_cm) : null,
        plan_name: m.plan_name ?? null, fee_paise: m.fee_rupees ? Math.round(Number(m.fee_rupees) * 100) : null, paid_until: m.paid_until || null,
      });
      if (r.error) return undo("Could not save member details");
      if (w) await service.from("fq_weight_logs").insert({ gym_id: me.gym_id, member_id: id, weight: w, recorded_by: who.user.id });
    }
    return json({ id });
  }

  if (body.action === "reset_password") {
    const password = String(body.password ?? "");
    if (password.length < 8) return json({ error: "Password needs at least 8 characters" }, 400);
    if (!(await sameGym(body.user_id))) return json({ error: "Not found" }, 404);
    const { error } = await service.auth.admin.updateUserById(body.user_id, { password });
    return error ? json({ error: "Could not reset the password" }, 400) : json({ ok: true });
  }

  if (body.action === "set_active") {
    if (body.user_id === who.user.id) return json({ error: "You cannot switch off your own login" }, 400);
    if (!(await sameGym(body.user_id))) return json({ error: "Not found" }, 404);
    const active = !!body.active;
    await service.from("fq_profiles").update({ active }).eq("id", body.user_id);
    await service.auth.admin.updateUserById(body.user_id, { ban_duration: active ? "none" : "876000h" });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
