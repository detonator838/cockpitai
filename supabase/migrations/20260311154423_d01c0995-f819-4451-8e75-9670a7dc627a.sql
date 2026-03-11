
-- Allow authenticated users to update events in their org (for marking read, updating status)
CREATE POLICY "Users can update org events"
ON public.events FOR UPDATE TO authenticated
USING (organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));
