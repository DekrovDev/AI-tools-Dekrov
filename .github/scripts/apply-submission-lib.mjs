import { findDuplicates } from "./submission-lib.mjs";

function sourcesFor(base, extra, verified) {
  return [...new Set([
    ...(base || []),
    ...(verified?.sources || []),
    ...(extra || []).filter(Boolean)
  ].filter(Boolean))];
}

export function applyApprovedSubmission({ submission, checkedTool, tools, today, verified = null }) {
  const nextTools = [...tools];
  let record;
  let diff;

  if (submission.type === "new") {
    const duplicates = findDuplicates(checkedTool, nextTools);
    if (duplicates.length) throw new Error(`Possible duplicate: ${duplicates.map((item) => item.id).join(", ")}`);
    record = {
      ...checkedTool,
      addedAt: today,
      updatedAt: today,
      lastVerifiedAt: verified?.lastVerifiedAt || today,
      sources: sourcesFor([], [checkedTool.url, checkedTool.github, checkedTool.docs], verified)
    };
    nextTools.push(record);
    diff = Object.keys(record).map((key) => `+ ${key}: ${JSON.stringify(record[key])}`);
  } else {
    const index = nextTools.findIndex((tool) => tool.id === submission.existingToolId);
    if (index < 0) throw new Error("Existing tool was not found.");
    const old = nextTools[index];
    const duplicates = findDuplicates(checkedTool, nextTools, old.id);
    if (duplicates.length) throw new Error(`Possible duplicate: ${duplicates.map((item) => item.id).join(", ")}`);
    record = {
      ...old,
      ...checkedTool,
      id: old.id,
      addedAt: old.addedAt || today,
      updatedAt: today,
      lastVerifiedAt: verified?.lastVerifiedAt || old.lastVerifiedAt || "",
      sources: sourcesFor(old.sources || [], [checkedTool.url, checkedTool.github, checkedTool.docs], verified)
    };
    delete record.notes;
    nextTools[index] = record;
    diff = Object.keys(record)
      .filter((key) => JSON.stringify(old[key]) !== JSON.stringify(record[key]))
      .map((key) => `- ${key}: ${JSON.stringify(old[key] ?? "")}\n+ ${key}: ${JSON.stringify(record[key])}`);
  }

  return { tools: nextTools, record, diff };
}
