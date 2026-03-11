
-- Create organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create app_role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  UNIQUE (user_id, role, organization_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for organizations
CREATE POLICY "Users can view their own organization"
ON public.organizations FOR SELECT TO authenticated
USING (id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Owners can update their organization"
ON public.organizations FOR UPDATE TO authenticated
USING (id IN (SELECT organization_id FROM public.user_roles WHERE user_id = auth.uid() AND role = 'owner'));

-- RLS policies for profiles
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid());

-- RLS policies for user_roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Function to handle new user signup (creates org, profile, role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_id UUID;
  company TEXT;
  full_name_val TEXT;
BEGIN
  company := NEW.raw_user_meta_data->>'company_name';
  full_name_val := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  IF company IS NOT NULL AND company != '' THEN
    INSERT INTO public.organizations (name) VALUES (company) RETURNING id INTO org_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, email, organization_id)
  VALUES (NEW.id, full_name_val, NEW.email, org_id);

  INSERT INTO public.user_roles (user_id, role, organization_id)
  VALUES (NEW.id, 'owner', org_id);

  RETURN NEW;
END;
$$;

-- Trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
