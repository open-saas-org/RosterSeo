// Human-readable labels for Clay's tools - matches how the rest of the app
// already names these actions (Add Keywords dialog, Track button, Launch
// audit, Add to Outreach) rather than raw tool/function names. Shared by
// the tool-call disclosure, the confirm card, and the live status
// indicator so a name only needs to be added in one place.
export const TOOL_LABELS: Record<string, string> = {
  add_tracked_keyword: "Track a new keyword",
  add_competitor: "Add a competitor",
  track_ai_visibility_prompt: "Track a new AI visibility prompt",
  start_site_audit: "Launch a Site Audit crawl",
  add_outreach_target: "Add a Backlink Outreach target",
  generate_outreach_draft: "Generate an outreach email draft",
  create_blog_post: "Draft a blog post",
  create_social_post: "Draft a social media post",
  update_project_notes: "Update project notes",
};
