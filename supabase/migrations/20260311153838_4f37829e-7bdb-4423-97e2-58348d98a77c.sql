
-- Create event severity enum
CREATE TYPE public.event_severity AS ENUM ('info', 'warning', 'error', 'critical');

-- Create event status enum
CREATE TYPE public.event_status AS ENUM ('logged', 'pending_approval', 'approved', 'rejected');

-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity event_severity NOT NULL DEFAULT 'info',
  status event_status NOT NULL DEFAULT 'logged',
  raw_payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view events in their org
CREATE POLICY "Users can view org events"
ON public.events FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Service role inserts (from edge function) - allow insert for service role by not restricting
-- We need a permissive policy for insert that the service role can use
CREATE POLICY "Service role can insert events"
ON public.events FOR INSERT
WITH CHECK (true);

-- Create approval_requests table
CREATE TABLE public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

-- Users can view approval requests in their org
CREATE POLICY "Users can view org approval requests"
ON public.approval_requests FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Users can update approval requests in their org
CREATE POLICY "Users can update org approval requests"
ON public.approval_requests FOR UPDATE TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Service role can insert approval requests
CREATE POLICY "Service role can insert approval requests"
ON public.approval_requests FOR INSERT
WITH CHECK (true);
