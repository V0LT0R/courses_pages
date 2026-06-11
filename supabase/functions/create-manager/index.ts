import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ message: 'Supabase environment variables are not configured.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ message: 'Unauthorized.' }, 401);
    }

    const { data: callerProfile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError || callerProfile?.role !== 'admin') {
      return json({ message: 'Only admin can create managers.' }, 403);
    }

    const { fullName, email, password } = await req.json();
    const normalizedEmail = String(email || '').toLowerCase().trim();

    if (!fullName || !normalizedEmail || !password) {
      return json({ message: 'Full name, email and password are required.' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
      app_metadata: {
        role: 'manager',
      },
    });

    if (createError) {
      return json({ message: createError.message }, 400);
    }

    const user = created.user;
    if (!user) {
      return json({ message: 'Manager was not created.' }, 500);
    }

    const { error: profileUpsertError } = await adminClient
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        email: normalizedEmail,
        role: 'manager',
      }, { onConflict: 'id' });

    if (profileUpsertError) {
      return json({ message: profileUpsertError.message }, 400);
    }

    return json({ ok: true, user: { id: user.id, email: user.email, role: 'manager' } }, 200);
  } catch (error) {
    return json({ message: error instanceof Error ? error.message : 'Unknown error.' }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
