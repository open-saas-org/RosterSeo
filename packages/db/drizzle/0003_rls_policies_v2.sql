-- RLS for the feature tables added in 0002. Same model as
-- 0001_rls_policies.sql: scoped by the requesting user's memberships via
-- organization_members, set through withUserContext(). Read that file's
-- header comment first if you're adding more tables later.

-- Direct project_id tables
ALTER TABLE page_analyzer_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_analyzer_reports FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON page_analyzer_reports
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

ALTER TABLE site_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_audits FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_audits
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

ALTER TABLE ai_visibility_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visibility_prompts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_visibility_prompts
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

ALTER TABLE local_rank_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_rank_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON local_rank_checks
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON google_connections
  USING (
    project_id IN (
      SELECT id FROM projects WHERE organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = current_setting('app.current_user_id', true)
      )
    )
  );

-- Indirect tables: project_id lives on the parent row, not this one.
ALTER TABLE keyword_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_rankings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON keyword_rankings
  USING (
    tracked_keyword_id IN (
      SELECT id FROM tracked_keywords WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)
        )
      )
    )
  );

ALTER TABLE site_audit_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_audit_issues FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON site_audit_issues
  USING (
    audit_id IN (
      SELECT id FROM site_audits WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)
        )
      )
    )
  );

ALTER TABLE ai_visibility_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visibility_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ai_visibility_results
  USING (
    prompt_id IN (
      SELECT id FROM ai_visibility_prompts WHERE project_id IN (
        SELECT id FROM projects WHERE organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = current_setting('app.current_user_id', true)
        )
      )
    )
  );
