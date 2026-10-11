-- Cole no Supabase: SQL Editor > New query > Run

create extension if not exists pgcrypto;

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  side text,
  group_name text,
  companions int not null default 0,
  phone text,
  rsvp text not null default 'Pendente',
  notes text
);

create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  city text,
  capacity int,
  price numeric(12,2),
  contact text,
  url text,
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'Pesquisando',
  notes text
);
-- (se a tabela já existia: alter table venues add column if not exists photos jsonb not null default '[]'::jsonb;)

-- Decoradores (category = 'Decoração'), fotógrafos ('Fotografia') e outros fornecedores
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null,
  name text not null,
  price numeric(12,2),
  contact text,
  instagram text,
  url text,
  status text not null default 'Pesquisando',
  notes text
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  description text not null,
  category text,
  estimated numeric(12,2),
  paid numeric(12,2),
  due_date date
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  due_date date,
  done boolean not null default false
);

-- data do casamento e orçamento total (chave/valor)
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  key text not null unique,
  value text
);

-- Segurança (RLS). Esta versão não tem login: quem tiver a anon key lê e escreve.
-- Para proteger, ative Supabase Auth e troque "to anon, authenticated" por "to authenticated".
do $$
declare t text;
begin
  foreach t in array array['guests','venues','vendors','expenses','tasks','settings'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "acesso_total" on %I', t);
    execute format('create policy "acesso_total" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Fotos dos locais: bucket público para leitura; envio liberado como nas tabelas (sem login)
insert into storage.buckets (id, name, public) values ('fotos-locais', 'fotos-locais', true)
on conflict (id) do nothing;
drop policy if exists "fotos_locais_acesso" on storage.objects;
create policy "fotos_locais_acesso" on storage.objects for all to anon, authenticated
  using (bucket_id = 'fotos-locais') with check (bucket_id = 'fotos-locais');
