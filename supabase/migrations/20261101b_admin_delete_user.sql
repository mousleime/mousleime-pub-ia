-- Suppression complète d'un utilisateur par le super administrateur.
-- Supprime le profil (et en cascade crédits et transactions) puis le compte d'authentification
-- (et en cascade créations et campagnes). Impossible de se supprimer soi-même ou de supprimer un super admin.
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_self'; end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'super_admin') then
    raise exception 'cannot_delete_admin';
  end if;
  delete from public.profiles where id = p_user;
  delete from auth.users where id = p_user;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
