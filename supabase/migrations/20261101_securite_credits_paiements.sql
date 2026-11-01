-- =====================================================================
-- MOUSLEIME PUB IA — Migration de sécurité, crédits, paiements, contact
-- Corrige :
--   * escalade de privilèges (un utilisateur pouvait se passer super_admin)
--   * lecture de tous les profils / crédits / transactions par tout compte connecté
--   * crédits impossibles à modifier côté serveur (achats, consommation, admin)
--   * colonnes manquantes sur transactions (status, phone_number)
--   * fonction handle_new_user exposée et sans search_path
-- Toutes les opérations sensibles passent désormais par des fonctions SQL
-- (SECURITY DEFINER) qui vérifient l'identité et appliquent les règles métier.
-- =====================================================================

-- ---------- 1. Structure ----------
alter table public.transactions
  add column if not exists status text not null default 'completed',
  add column if not exists phone_number text,
  add column if not exists reference text,
  add column if not exists validated_at timestamptz;

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions
  add constraint transactions_status_check
  check (status in ('pending','completed','failed','cancelled'));

create unique index if not exists credits_user_id_key on public.credits (user_id);
alter table public.credits drop constraint if exists credits_amount_nonneg;
alter table public.credits add constraint credits_amount_nonneg check (amount >= 0);

create table if not exists public.credit_packs (
  credits int primary key check (credits > 0),
  price_fcfa int not null check (price_fcfa > 0),
  active boolean not null default true
);
insert into public.credit_packs (credits, price_fcfa) values
  (10, 2000), (50, 8000), (100, 15000), (500, 60000)
on conflict (credits) do nothing;

create table if not exists public.app_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('payment_instructions',
   'Après votre demande, notre équipe vous contacte au numéro indiqué pour finaliser le paiement par Mobile Money. Vos crédits sont ajoutés dès la réception du paiement.')
on conflict (key) do nothing;

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 5 and 200),
  subject text not null default 'Contact' check (char_length(subject) <= 200),
  message text not null check (char_length(message) between 5 and 5000),
  status text not null default 'new' check (status in ('new','read','done')),
  created_at timestamptz not null default now()
);

alter table public.credit_packs enable row level security;
alter table public.app_settings enable row level security;
alter table public.contact_messages enable row level security;

-- ---------- 2. Aide : le compte courant est-il super admin ? ----------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'super_admin' and coalesce(p.is_active, true)
       from public.profiles p where p.id = auth.uid()),
    false);
$$;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;

-- ---------- 3. Droits de base : on retire tout ce qui n'est pas nécessaire ----------
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ---------- 4. profiles ----------
drop policy if exists profiles_select_all_authenticated on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_super_admin());
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Un utilisateur ne peut modifier QUE ces colonnes (jamais role / is_active / email)
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, company_name) on public.profiles to authenticated;

-- ---------- 5. credits : lecture seule côté client ----------
drop policy if exists credits_select_all on public.credits;
create policy credits_select_own on public.credits
  for select to authenticated using (user_id = auth.uid());
create policy credits_select_admin on public.credits
  for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.credits from authenticated;

-- ---------- 6. transactions : lecture seule côté client ----------
drop policy if exists transactions_insert on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists transactions_select_all on public.transactions;
drop policy if exists "Users can view own transactions" on public.transactions;

create policy transactions_select_own on public.transactions
  for select to authenticated using (user_id = auth.uid());
create policy transactions_select_admin on public.transactions
  for select to authenticated using (public.is_super_admin());
revoke insert, update, delete on public.transactions from authenticated;

-- ---------- 7. creations : création uniquement via start_creation() ----------
drop policy if exists "Users can insert own creations" on public.creations;
drop policy if exists "Users can update own creations" on public.creations;
create policy "Users can update own creations" on public.creations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy creations_select_admin on public.creations
  for select to authenticated using (public.is_super_admin());
revoke insert, update on public.creations from authenticated;
grant update (saved, project_name) on public.creations to authenticated;

-- ---------- 8. campaigns : empêcher le changement de propriétaire ----------
drop policy if exists "Users can update own campaigns" on public.campaigns;
create policy "Users can update own campaigns" on public.campaigns
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy campaigns_select_admin on public.campaigns
  for select to authenticated using (public.is_super_admin());

-- ---------- 9. Nouvelles tables ----------
drop policy if exists credit_packs_read on public.credit_packs;
create policy credit_packs_read on public.credit_packs
  for select to anon, authenticated using (active);
grant select on public.credit_packs to anon, authenticated;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to anon, authenticated using (true);
grant select on public.app_settings to anon, authenticated;

drop policy if exists contact_insert on public.contact_messages;
create policy contact_insert on public.contact_messages
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
drop policy if exists contact_select_admin on public.contact_messages;
create policy contact_select_admin on public.contact_messages
  for select to authenticated using (public.is_super_admin());
drop policy if exists contact_update_admin on public.contact_messages;
create policy contact_update_admin on public.contact_messages
  for update to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
grant insert on public.contact_messages to anon, authenticated;
grant select, update on public.contact_messages to authenticated;

-- ---------- 10. Création de compte : profil + 5 crédits offerts ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), ''),
    'user'
  )
  on conflict (id) do nothing;

  insert into public.credits (user_id, amount, subscription_type)
  values (new.id, 5, 'free')
  on conflict (user_id) do nothing;

  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 11. Fonctions utilisateur ----------

-- Débite les crédits ET crée la création (statut "processing") en une opération atomique.
create or replace function public.start_creation(
  p_type text, p_prompt text, p_project text, p_platform text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cost int;
  v_id uuid;
  v_before int;
  v_after int;
  v_platform text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not coalesce((select is_active from public.profiles where id = v_uid), false) then
    raise exception 'account_suspended';
  end if;

  if p_type in ('image', 'texte') then v_cost := 1;
  else raise exception 'unsupported_type';
  end if;

  if p_prompt is null or char_length(btrim(p_prompt)) < 3 or char_length(p_prompt) > 2000 then
    raise exception 'invalid_prompt';
  end if;

  v_platform := case when p_platform in ('facebook','instagram','tiktok','google') then p_platform else 'autre' end;

  update public.credits
     set amount = amount - v_cost, updated_at = now()
   where user_id = v_uid and amount >= v_cost
  returning amount + v_cost, amount into v_before, v_after;
  if not found then raise exception 'insufficient_credits'; end if;

  insert into public.creations (user_id, type, prompt, project_name, platform, status, credits_used)
  values (v_uid, p_type, btrim(p_prompt),
          left(coalesce(nullif(btrim(p_project), ''), 'Sans titre'), 120),
          v_platform, 'processing', v_cost)
  returning id into v_id;

  insert into public.transactions (user_id, type, amount, credits_before, credits_after, description, status)
  values (v_uid, 'consumption', -v_cost, v_before, v_after, 'Génération ' || p_type, 'completed');

  return v_id;
end;
$$;

create or replace function public.complete_creation(p_id uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_result is null or char_length(p_result) = 0 or char_length(p_result) > 20000 then
    raise exception 'invalid_result';
  end if;
  update public.creations
     set status = 'completed', result_url = p_result
   where id = p_id and user_id = auth.uid() and status = 'processing';
  if not found then raise exception 'creation_not_found'; end if;
end;
$$;

-- Marque l'échec et rembourse UNE seule fois (uniquement si la création était "processing").
create or replace function public.fail_creation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cost int;
  v_before int;
  v_after int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.creations set status = 'failed'
   where id = p_id and user_id = v_uid and status = 'processing'
  returning credits_used into v_cost;
  if not found then return; end if;

  update public.credits set amount = amount + v_cost, updated_at = now()
   where user_id = v_uid
  returning amount - v_cost, amount into v_before, v_after;

  insert into public.transactions (user_id, type, amount, credits_before, credits_after, description, status)
  values (v_uid, 'bonus', v_cost, v_before, v_after, 'Remboursement : génération échouée', 'completed');
end;
$$;

-- Demande d'achat de crédits (paiement validé ensuite par l'équipe).
create or replace function public.request_credit_purchase(p_credits int, p_method text, p_phone text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price int;
  v_ref text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select price_fcfa into v_price from public.credit_packs where credits = p_credits and active;
  if v_price is null then raise exception 'invalid_pack'; end if;
  if p_method not in ('mtn','moov','celtiis') then raise exception 'invalid_method'; end if;
  if p_phone is null or btrim(p_phone) !~ '^\+?[0-9 ]{8,16}$' then raise exception 'invalid_phone'; end if;
  if (select count(*) from public.transactions
       where user_id = v_uid and type = 'purchase' and status = 'pending') >= 3 then
    raise exception 'too_many_pending';
  end if;

  v_ref := 'MPI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.transactions
    (user_id, type, amount, description, payment_method, amount_fcf, phone_number, status, reference)
  values
    (v_uid, 'purchase', p_credits,
     'Achat de ' || p_credits || ' crédits via ' || upper(p_method),
     p_method, v_price, btrim(p_phone), 'pending', v_ref);
  return v_ref;
end;
$$;

create or replace function public.cancel_purchase_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.transactions set status = 'cancelled'
   where id = p_id and user_id = auth.uid() and type = 'purchase' and status = 'pending';
end;
$$;

-- ---------- 12. Fonctions administrateur ----------
create or replace function public.admin_adjust_credits(p_user uuid, p_delta int, p_reason text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_before int; v_after int;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_delta = 0 or abs(p_delta) > 100000 then raise exception 'invalid_adjustment'; end if;
  update public.credits set amount = amount + p_delta, updated_at = now()
   where user_id = p_user and amount + p_delta >= 0
  returning amount - p_delta, amount into v_before, v_after;
  if not found then raise exception 'invalid_adjustment'; end if;
  insert into public.transactions (user_id, type, amount, credits_before, credits_after, description, status)
  values (p_user, 'bonus', p_delta, v_before, v_after,
          left('Ajustement administrateur' || coalesce(' : ' || nullif(btrim(p_reason), ''), ''), 200), 'completed');
  return v_after;
end;
$$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_self'; end if;
  update public.profiles set is_active = p_active, updated_at = now() where id = p_user;
end;
$$;

create or replace function public.admin_validate_purchase(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t public.transactions%rowtype; v_before int; v_after int;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select * into t from public.transactions
   where id = p_tx and type = 'purchase' and status = 'pending' for update;
  if not found then raise exception 'purchase_not_found'; end if;
  update public.credits set amount = amount + t.amount, updated_at = now()
   where user_id = t.user_id
  returning amount - t.amount, amount into v_before, v_after;
  if not found then raise exception 'credits_not_found'; end if;
  update public.transactions
     set status = 'completed', credits_before = v_before, credits_after = v_after, validated_at = now()
   where id = p_tx;
end;
$$;

create or replace function public.admin_reject_purchase(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  update public.transactions set status = 'failed', validated_at = now()
   where id = p_tx and type = 'purchase' and status = 'pending';
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('payment_instructions') then raise exception 'invalid_key'; end if;
  if char_length(coalesce(p_value, '')) > 1000 then raise exception 'value_too_long'; end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'users',            (select count(*) from public.profiles),
    'credits_total',    (select coalesce(sum(amount), 0) from public.credits),
    'revenue_fcfa',     (select coalesce(sum(amount_fcf), 0) from public.transactions
                          where type = 'purchase' and status = 'completed'),
    'campaigns_active', (select count(*) from public.campaigns where status = 'active'),
    'purchases_pending',(select count(*) from public.transactions
                          where type = 'purchase' and status = 'pending'),
    'messages_new',     (select count(*) from public.contact_messages where status = 'new')
  );
end;
$$;

-- ---------- 13. Droits d'exécution : jamais anonymes ----------
do $$
declare f text;
begin
  foreach f in array array[
    'start_creation(text,text,text,text)',
    'complete_creation(uuid,text)',
    'fail_creation(uuid)',
    'request_credit_purchase(integer,text,text)',
    'cancel_purchase_request(uuid)',
    'admin_adjust_credits(uuid,integer,text)',
    'admin_set_active(uuid,boolean)',
    'admin_validate_purchase(uuid)',
    'admin_reject_purchase(uuid)',
    'admin_set_setting(text,text)',
    'admin_stats()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
