// Pure frontend builder for the Install / setup failure report. It only opens
// GitHub's hosted Issue Form in a new tab — the site itself never sends data to
// GitHub through an API, holds no token, and never modifies the catalog. This
// module is DOM-free so it can be tested headlessly.

export const INSTALL_FAILURE_TEMPLATE = "install-failure.yml";
export const INSTALL_FAILURE_LABEL = "install-failure";
export const INSTALL_FAILURE_PREFIX = "[Install failure]";

// Canonical issue title carrying the tool id in a structured token so the
// issue form's optional "Tool ID" field can be left empty:
//   [Install failure][aider] Aider
export function installFailureTitle(tool) {
  const id = String(tool?.id || "").trim();
  const name = String(tool?.name || "").trim() || id;
  return `${INSTALL_FAILURE_PREFIX}[${id}] ${name}`;
}

// Build the GitHub Issue Form URL for a catalog tool. repo is like
// "DekrovDev/AI-tools-Dekrov". template defaults to the install-failure form.
export function installFailureIssueUrl(tool, repo, template = INSTALL_FAILURE_TEMPLATE) {
  const cleanRepo = String(repo || "").replace(/^\/+|\/+$/g, "");
  if (!cleanRepo) return "";
  const params = new URLSearchParams({
    template,
    labels: INSTALL_FAILURE_LABEL,
    title: installFailureTitle(tool)
  });
  return `https://github.com/${cleanRepo}/issues/new?${params.toString()}`;
}