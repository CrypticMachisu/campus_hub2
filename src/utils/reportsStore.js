import { apiFetch } from "./api";

/** Flag a post or comment. One report per member per target. */
export async function reportContent({ targetType, targetId, reason, note = "" }) {
  return apiFetch("/reports", {
    method: "POST",
    body: { targetType, targetId, reason, note },
  });
}

/** Open reports for a managed club. */
export async function getReports(clubId) {
  const data = await apiFetch(`/reports?clubId=${encodeURIComponent(clubId)}`);
  return data.reports;
}

/** action: dismiss | hide | remove */
export async function resolveReport(reportId, action) {
  return apiFetch(`/reports/${encodeURIComponent(reportId)}/resolve`, {
    method: "PATCH",
    body: { action },
  });
}
