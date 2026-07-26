-- Categories currently have select/insert/update policies for admins but no
-- delete policy, so admins could not remove a category via the API.
create policy "categories_delete_admin" on public.categories
  for delete to authenticated
  using (
    location_id = public.get_current_location_id()
    and (select role from public.user_profiles where id = auth.uid()) = 'admin'
  );
