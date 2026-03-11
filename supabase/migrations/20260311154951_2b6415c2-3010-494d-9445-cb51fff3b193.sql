
-- Add foreign key from audit_log.user_id to profiles.id for join support
ALTER TABLE public.audit_log
ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id);
