import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useOrgProfile() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const orgId = profile?.organization_id;

  const { data: org } = useQuery({
    queryKey: ["org", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return { orgId, orgName: org?.name ?? "My Organization" };
}
