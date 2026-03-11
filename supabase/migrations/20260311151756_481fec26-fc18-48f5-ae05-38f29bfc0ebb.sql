
-- Create agent type and risk level enums
CREATE TYPE public.agent_type AS ENUM ('hubspot', 'zapier', 'github', 'intercom', 'custom');
CREATE TYPE public.risk_level AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.agent_status AS ENUM ('active', 'paused');

-- Create agents table
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type agent_type NOT NULL DEFAULT 'custom',
  risk_level risk_level NOT NULL DEFAULT 'low',
  status agent_status NOT NULL DEFAULT 'active',
  description TEXT DEFAULT '',
  owner_email TEXT NOT NULL,
  webhook_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- Users can view agents in their organization
CREATE POLICY "Users can view org agents"
ON public.agents FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Users can insert agents into their organization
CREATE POLICY "Users can insert org agents"
ON public.agents FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Users can update agents in their organization
CREATE POLICY "Users can update org agents"
ON public.agents FOR UPDATE TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Users can delete agents in their organization
CREATE POLICY "Users can delete org agents"
ON public.agents FOR DELETE TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
