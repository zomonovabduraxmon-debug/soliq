-- SOLIQ NAZORAT: Supabase SQL Editor ichida bir marta ishga tushiring.
-- Frontend faqat publishable/anon key ishlatadi. service_role key'ni brauzerga qo'ymang.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  inn text not null,
  director_name text not null default '',
  phone text not null default '',
  monthly_fee numeric(14,2) not null default 0 check (monthly_fee >= 0),
  billing_start_period text not null default to_char(current_date, 'YYYY-MM') check (billing_start_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  pfx_path text,
  pfx_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, inn)
);

create table if not exists public.organization_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  report_name text not null,
  deadline_day integer not null default 15 check (deadline_day between 1 and 31),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, report_name)
);

create table if not exists public.report_statuses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_report_id uuid not null references public.organization_reports(id) on delete cascade,
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  due_date date not null,
  submitted boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_report_id, period_key),
  check ((submitted = true) or submitted_at is null)
);

create table if not exists public.monthly_finances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_due numeric(14,2) not null default 0 check (amount_due >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id, period_key)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  period_key text not null check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14,2) not null check (amount > 0),
  paid_at date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists organizations_owner_name_idx on public.organizations(owner_id, name);
create index if not exists org_reports_owner_org_idx on public.organization_reports(owner_id, organization_id);
create index if not exists report_statuses_owner_period_idx on public.report_statuses(owner_id, period_key);
create index if not exists monthly_finances_owner_period_idx on public.monthly_finances(owner_id, period_key);
create index if not exists payments_owner_period_idx on public.payments(owner_id, period_key);

alter table public.organizations enable row level security;
alter table public.organization_reports enable row level security;
alter table public.report_statuses enable row level security;
alter table public.monthly_finances enable row level security;
alter table public.payments enable row level security;

-- Organizations
 drop policy if exists "sn_org_select_own" on public.organizations;
 drop policy if exists "sn_org_insert_own" on public.organizations;
 drop policy if exists "sn_org_update_own" on public.organizations;
 drop policy if exists "sn_org_delete_own" on public.organizations;
create policy "sn_org_select_own" on public.organizations for select to authenticated using (owner_id = auth.uid());
create policy "sn_org_insert_own" on public.organizations for insert to authenticated with check (owner_id = auth.uid());
create policy "sn_org_update_own" on public.organizations for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sn_org_delete_own" on public.organizations for delete to authenticated using (owner_id = auth.uid());

-- Organization report types
 drop policy if exists "sn_reptype_select_own" on public.organization_reports;
 drop policy if exists "sn_reptype_insert_own" on public.organization_reports;
 drop policy if exists "sn_reptype_update_own" on public.organization_reports;
 drop policy if exists "sn_reptype_delete_own" on public.organization_reports;
create policy "sn_reptype_select_own" on public.organization_reports for select to authenticated using (owner_id = auth.uid());
create policy "sn_reptype_insert_own" on public.organization_reports for insert to authenticated with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
  )
);
create policy "sn_reptype_update_own" on public.organization_reports for update to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
  )
);
create policy "sn_reptype_delete_own" on public.organization_reports for delete to authenticated using (owner_id = auth.uid());

-- Report statuses
 drop policy if exists "sn_status_select_own" on public.report_statuses;
 drop policy if exists "sn_status_insert_own" on public.report_statuses;
 drop policy if exists "sn_status_update_own" on public.report_statuses;
 drop policy if exists "sn_status_delete_own" on public.report_statuses;
create policy "sn_status_select_own" on public.report_statuses for select to authenticated using (owner_id = auth.uid());
create policy "sn_status_insert_own" on public.report_statuses for insert to authenticated with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organization_reports r where r.id = organization_report_id and r.owner_id = auth.uid()
  )
);
create policy "sn_status_update_own" on public.report_statuses for update to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organization_reports r where r.id = organization_report_id and r.owner_id = auth.uid()
  )
);
create policy "sn_status_delete_own" on public.report_statuses for delete to authenticated using (owner_id = auth.uid());

-- Monthly fees
 drop policy if exists "sn_finance_select_own" on public.monthly_finances;
 drop policy if exists "sn_finance_insert_own" on public.monthly_finances;
 drop policy if exists "sn_finance_update_own" on public.monthly_finances;
 drop policy if exists "sn_finance_delete_own" on public.monthly_finances;
create policy "sn_finance_select_own" on public.monthly_finances for select to authenticated using (owner_id = auth.uid());
create policy "sn_finance_insert_own" on public.monthly_finances for insert to authenticated with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
  )
);
create policy "sn_finance_update_own" on public.monthly_finances for update to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
  )
);
create policy "sn_finance_delete_own" on public.monthly_finances for delete to authenticated using (owner_id = auth.uid());

-- Payment transactions
 drop policy if exists "sn_payment_select_own" on public.payments;
 drop policy if exists "sn_payment_insert_own" on public.payments;
 drop policy if exists "sn_payment_update_own" on public.payments;
 drop policy if exists "sn_payment_delete_own" on public.payments;
create policy "sn_payment_select_own" on public.payments for select to authenticated using (owner_id = auth.uid());
create policy "sn_payment_insert_own" on public.payments for insert to authenticated with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
  )
);
create policy "sn_payment_update_own" on public.payments for update to authenticated using (owner_id = auth.uid()) with check (
  owner_id = auth.uid() and exists (
    select 1 from public.organizations o where o.id = organization_id and o.owner_id = auth.uid()
  )
);
create policy "sn_payment_delete_own" on public.payments for delete to authenticated using (owner_id = auth.uid());

-- Private PFX file bucket. Files are stored under: <auth-user-id>/<organization-id>/<filename>
insert into storage.buckets (id, name, public, file_size_limit)
values ('pfx-keys', 'pfx-keys', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "sn_pfx_select_own" on storage.objects;
drop policy if exists "sn_pfx_insert_own" on storage.objects;
drop policy if exists "sn_pfx_update_own" on storage.objects;
drop policy if exists "sn_pfx_delete_own" on storage.objects;
create policy "sn_pfx_select_own" on storage.objects for select to authenticated using (
  bucket_id = 'pfx-keys' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "sn_pfx_insert_own" on storage.objects for insert to authenticated with check (
  bucket_id = 'pfx-keys' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "sn_pfx_update_own" on storage.objects for update to authenticated using (
  bucket_id = 'pfx-keys' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'pfx-keys' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "sn_pfx_delete_own" on storage.objects for delete to authenticated using (
  bucket_id = 'pfx-keys' and (storage.foldername(name))[1] = auth.uid()::text
);

-- Eslatma: Saytning ro'yxatdan o'tish sahifasi yo'q. Supabase Auth > Users bo'limida o'zingiz uchun bitta user yarating.
