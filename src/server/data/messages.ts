import "server-only";
import { withUser } from "@/server/db/client";

export type ThreadMessage = {
  id: string;
  author_id: string | null;
  author_name: string;
  author_side: "business" | "worker" | "staff" | "former";
  body: string | null;
  created_at: Date;
  hidden: boolean;
  hidden_reason: string | null;
};

export function getJobThread(userId: string, jobId: string) {
  return withUser(userId, (tx) => tx<ThreadMessage[]>`select * from public.job_thread(${jobId})`);
}

export async function postJobMessage(userId: string, jobId: string, body: string) {
  await withUser(userId, (tx) => tx`select public.post_job_message(${jobId}, ${body})`);
}

export async function hideJobMessage(userId: string, messageId: string, reason: string) {
  await withUser(userId, (tx) => tx`select public.hide_job_message(${messageId}, ${reason})`);
}
