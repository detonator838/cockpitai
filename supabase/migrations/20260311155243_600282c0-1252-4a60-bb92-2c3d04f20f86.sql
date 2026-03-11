
-- Allow users to view profiles of members in same org
CREATE POLICY "Users can view org member profiles"
ON public.profiles FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

-- Create invitations table
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org invitations"
ON public.invitations FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can insert org invitations"
ON public.invitations FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()) AND invited_by = auth.uid());
