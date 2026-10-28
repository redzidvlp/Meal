/**
 * One place where a failed AI call becomes words a person can act on.
 *
 * The functions answer with a short reason ("bad_key", "quota", "model" …).
 * Repeating the raw word helps nobody, and turning every failure into "the AI
 * did not answer" is worse: a wrong key, an empty quota and a phone with no
 * signal need three different fixes.
 */
export const AI_REASON_KEYS = {
  bad_key: "aiReasonBadKey",
  quota: "aiReasonQuota",
  model: "aiReasonModel",
  network: "aiReasonNetwork",
  relay: "aiReasonNetwork",
  unreachable: "aiReasonNetwork",
  upstream_unreachable: "aiReasonNetwork",
  unreadable_result: "aiReasonUnreadable",
  unreadable: "aiReasonUnreadable",
  upstream_failed: "aiReasonGeneric",
  unknown: "aiReasonGeneric",
};

/** Translation key for a reason, or null when there is nothing useful to add. */
export const aiReasonKey = reason => AI_REASON_KEYS[String(reason || "")] || null;
