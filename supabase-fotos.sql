-- Rode só este arquivo se você JÁ executou o supabase.sql antes (adiciona as fotos dos locais)
alter table venues add column if not exists photos jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public) values ('fotos-locais', 'fotos-locais', true)
on conflict (id) do nothing;
drop policy if exists "fotos_locais_acesso" on storage.objects;
create policy "fotos_locais_acesso" on storage.objects for all to anon, authenticated
  using (bucket_id = 'fotos-locais') with check (bucket_id = 'fotos-locais');
