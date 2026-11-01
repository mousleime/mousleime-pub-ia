-- Paiement en ligne (FedaPay) : crédits ajoutés automatiquement après un paiement confirmé.
-- Les fonctions "service_*" ne sont appelables que par les Edge Functions (rôle service_role).

alter table public.transactions add column if not exists provider_ref text;
create unique index if not exists transactions_provider_ref_key
  on public.transactions (provider_ref) where provider_ref is not null;

insert into public.app_settings (key, value) values ('auto_payment', 'off')
on conflict (key) do nothing;

-- L'administrateur peut activer / désactiver le paiement automatique.
create or replace function public.admin_set_setting(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_key not in ('payment_instructions', 'auto_payment') then raise exception 'invalid_key'; end if;
  if p_key = 'auto_payment' and coalesce(p_value, '') not in ('on', 'off') then raise exception 'invalid_value'; end if;
  if char_length(coalesce(p_value, '')) > 1000 then raise exception 'value_too_long'; end if;
  insert into public.app_settings (key, value, updated_at) values (p_key, coalesce(p_value, ''), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end;
$$;

-- Crée une demande d'achat "en ligne" (statut pending) avant la redirection vers FedaPay.
create or replace function public.request_online_purchase(p_credits int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_price int;
  v_ref text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not coalesce((select is_active from public.profiles where id = v_uid), false) then
    raise exception 'account_suspended';
  end if;
  select price_fcfa into v_price from public.credit_packs where credits = p_credits and active;
  if v_price is null then raise exception 'invalid_pack'; end if;

  -- Les paiements abandonnés depuis plus d'une heure sont annulés (un paiement tardif reste crédité).
  update public.transactions set status = 'cancelled'
   where user_id = v_uid and type = 'purchase' and status = 'pending'
     and payment_method = 'fedapay' and created_at < now() - interval '1 hour';

  if (select count(*) from public.transactions
       where user_id = v_uid and type = 'purchase' and status = 'pending') >= 3 then
    raise exception 'too_many_pending';
  end if;

  v_ref := 'MPI-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.transactions
    (user_id, type, amount, description, payment_method, amount_fcf, status, reference)
  values
    (v_uid, 'purchase', p_credits, 'Achat de ' || p_credits || ' crédits (paiement en ligne)',
     'fedapay', v_price, 'pending', v_ref)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'reference', v_ref, 'amount_fcfa', v_price);
end;
$$;
revoke all on function public.request_online_purchase(int) from public, anon;
grant execute on function public.request_online_purchase(int) to authenticated;

-- Appelée par le webhook après vérification auprès de FedaPay : ajoute les crédits UNE seule fois.
create or replace function public.service_complete_purchase(p_provider_ref text, p_amount int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare t public.transactions%rowtype; v_before int; v_after int;
begin
  select * into t from public.transactions
   where provider_ref = p_provider_ref and type = 'purchase' for update;
  if not found then return 'not_found'; end if;
  if t.status = 'completed' then return 'already'; end if;
  if t.status not in ('pending', 'cancelled') then return 'ignored'; end if;
  if t.amount_fcf is distinct from p_amount then return 'amount_mismatch'; end if;

  update public.credits set amount = amount + t.amount, updated_at = now()
   where user_id = t.user_id
  returning amount - t.amount, amount into v_before, v_after;
  if not found then return 'no_credits'; end if;

  update public.transactions
     set status = 'completed', credits_before = v_before, credits_after = v_after, validated_at = now()
   where id = t.id;
  return 'completed';
end;
$$;

create or replace function public.service_fail_purchase(p_provider_ref text, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.transactions
     set status = case when p_status = 'canceled' then 'cancelled' else 'failed' end,
         validated_at = now()
   where provider_ref = p_provider_ref and type = 'purchase' and status = 'pending';
end;
$$;

revoke all on function public.service_complete_purchase(text, int) from public, anon, authenticated;
revoke all on function public.service_fail_purchase(text, text) from public, anon, authenticated;
grant execute on function public.service_complete_purchase(text, int) to service_role;
grant execute on function public.service_fail_purchase(text, text) to service_role;
