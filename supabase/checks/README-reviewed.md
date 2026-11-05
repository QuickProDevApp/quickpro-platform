# Reviewed destructive statements

`reviewed-destructive-statements.txt` lists, as `file:line:text`, the only
`delete from` / `drop` / `truncate` lines in `supabase/migrations` that the
preview migration workflow accepts. Each was read and approved; any other
match, or a change to one of these lines, stops the workflow.

| Line | What it does | Why it is safe |
|---|---|---|
| `20261030000100_team_invitations.sql:240` | The last statement of `public.remove_member(org, user)`. It deletes **one** row from `organization_members`, the membership of `p_user_id` in `p_org_id`. | It sits inside a function body, so applying the migration deletes nothing. It runs only when a signed-in user calls the function: removing themselves, or an owner/admin removing someone else. Only owners can remove owners and admins, and the last owner can never be removed. The person's account, the organization and its records are untouched. Covered by `tests/db/teams.test.ts`. |
