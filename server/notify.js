// Targeted in-app notices. Callers own the wording; this file owns the write.
//
// Notifications are secondary to the action that caused them: a failed insert
// must not turn a successful cancellation or reschedule into a 500 for the
// officer. The helper returns how many were written and leaves logging to the
// caller when that matters.
import { randomUUID } from "node:crypto";
import { pool } from "./db.js";

/**
 * Insert one notice per user. Duplicate user ids are collapsed so a person with
 * two signup rows can never get two identical notices.
 *
 * @param {string[]} userIds
 * @param {{ kind: string, title: string, body?: string, link?: string }} notice
 * @returns {Promise<number>} rows written
 */
export async function notifyUsers(userIds, { kind, title, body = "", link = null }) {
  const recipients = [...new Set(userIds.filter(Boolean))];
  if (recipients.length === 0) return 0;

  const values = [];
  const params = {
    kind,
    title: title.slice(0, 200),
    body,
    link,
  };

  recipients.forEach((userId, index) => {
    values.push(`(:id${index}, :user${index}, :kind, :title, :body, :link)`);
    params[`id${index}`] = `note-${randomUUID()}`;
    params[`user${index}`] = userId;
  });

  await pool.query(
    `INSERT INTO notifications (notification_id, user_id, kind, title, body, link)
     VALUES ${values.join(", ")}`,
    params
  );
  return recipients.length;
}
