// Retired. Remove the deployed create-manager Edge Function before release.
// The UI now uses POST /api/admin/managers with Supabase Auth and an admin role check.
Deno.serve(() => new Response(JSON.stringify({message:'Endpoint retired'}), {status:410,headers:{'Content-Type':'application/json'}}));
