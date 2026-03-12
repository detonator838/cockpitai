
-- Create a security definer function to get the current user's org_id without hitting RLS
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ══ AGENTS ══
DROP POLICY IF EXISTS "Users can view org agents" ON public.agents;
CREATE POLICY "Users can view org agents" ON public.agents
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org agents" ON public.agents;
CREATE POLICY "Users can insert org agents" ON public.agents
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can update org agents" ON public.agents;
CREATE POLICY "Users can update org agents" ON public.agents
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can delete org agents" ON public.agents;
CREATE POLICY "Users can delete org agents" ON public.agents
  FOR DELETE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ══ APPROVAL_REQUESTS ══
DROP POLICY IF EXISTS "Users can view org approval requests" ON public.approval_requests;
CREATE POLICY "Users can view org approval requests" ON public.approval_requests
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can update org approval requests" ON public.approval_requests;
CREATE POLICY "Users can update org approval requests" ON public.approval_requests
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ══ AUDIT_LOG ══
DROP POLICY IF EXISTS "Users can view org audit logs" ON public.audit_log;
CREATE POLICY "Users can view org audit logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org audit logs" ON public.audit_log;
CREATE POLICY "Users can insert org audit logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id() AND user_id = auth.uid());

-- ══ EVENTS ══
DROP POLICY IF EXISTS "Users can view org events" ON public.events;
CREATE POLICY "Users can view org events" ON public.events
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can update org events" ON public.events;
CREATE POLICY "Users can update org events" ON public.events
  FOR UPDATE TO authenticated
  USING (organization_id = public.get_user_org_id());

-- ══ INVITATIONS ══
DROP POLICY IF EXISTS "Users can view org invitations" ON public.invitations;
CREATE POLICY "Users can view org invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

DROP POLICY IF EXISTS "Users can insert org invitations" ON public.invitations;
CREATE POLICY "Users can insert org invitations" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id() AND invited_by = auth.uid());

-- ══ ORGANIZATIONS ══
DROP POLICY IF EXISTS "Users can view their own organization" ON public.organizations;
CREATE POLICY "Users can view their own organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.get_user_org_id());

DROP POLICY IF EXISTS "Owners can update their organization" ON public.organizations;
CREATE POLICY "Owners can update their organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.get_user_org_id() AND public.has_role(auth.uid(), 'owner'));

-- ══ PROFILES ══
DROP POLICY IF EXISTS "Users can view org member profiles" ON public.profiles;
CREATE POLICY "Users can view org member profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (organization_id = public.get_user_org_id());

-- Keep the direct self-view policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());
