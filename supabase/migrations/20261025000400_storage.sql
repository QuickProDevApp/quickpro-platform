-- Private bucket for qualification documents (Supabase Storage only).
--
-- No storage.objects policies are created for anon or authenticated, so the
-- bucket is reachable only with the service role key, from the server, after
-- the server has authorized the request against public.qualification_documents.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('qualification-documents', 'qualification-documents', false, 10485760,
            array['application/pdf', 'image/jpeg', 'image/png'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end;
$$;
