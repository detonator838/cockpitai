import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus, CreditCard, Sparkles, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">Manage your organization and account.</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          {orgId && <GeneralTab orgId={orgId} />}
        </TabsContent>
        <TabsContent value="team">
          {orgId && user && <TeamTab orgId={orgId} userId={user.id} />}
        </TabsContent>
        <TabsContent value="billing">
          <BillingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── General Tab ─── */
function GeneralTab({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();

  const { data: org } = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [name, setName] = useState<string | null>(null);
  const displayName = name ?? org?.name ?? "";

  if (org && name === null) {
    setName(org.name);
  }

  const updateOrg = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("organizations")
        .update({ name: displayName })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org"] });
      toast.success("Organization name updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization</CardTitle>
        <CardDescription>Update your organization's display name.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            updateOrg.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="orgName">Organization Name</Label>
            <Input
              id="orgName"
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              required
            />
          </div>
          <Button type="submit" disabled={updateOrg.isPending}>
            {updateOrg.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ─── Team Tab ─── */
function TeamTab({ orgId, userId }: { orgId: string; userId: string }) {
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["team-members", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, created_at")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data;
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["team-roles", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("organization_id", orgId);
      if (error) throw error;
      return data;
    },
  });

  const { data: invitations = [] } = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select("*")
        .eq("organization_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const roleMap = Object.fromEntries(roles.map((r) => [r.user_id, r.role]));

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("invitations")
        .insert({
          organization_id: orgId,
          email: inviteEmail,
          invited_by: userId,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast.success("Invitation sent");
      setInviteEmail("");
      setInviteOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const roleColors: Record<string, string> = {
    owner: "bg-primary/10 text-primary border-primary/20",
    admin: "bg-amber-100 text-amber-800 border-amber-200",
    member: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>People with access to your organization.</CardDescription>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <UserPlus className="h-4 w-4 mr-2" /> Invite Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4 py-4"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="inviteEmail">Email Address</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={invite.isPending}>
                  {invite.isPending ? "Sending…" : "Send Invite"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.full_name || "—"}</TableCell>
                <TableCell>{m.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={roleColors[roleMap[m.id] || "member"]}>
                    {(roleMap[m.id] || "member").charAt(0).toUpperCase() + (roleMap[m.id] || "member").slice(1)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {format(new Date(m.created_at), "MMM d, yyyy")}
                </TableCell>
              </TableRow>
            ))}
            {invitations.map((inv) => (
              <TableRow key={inv.id} className="opacity-60">
                <TableCell className="font-medium italic">Pending invite</TableCell>
                <TableCell>{inv.email}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Invited</Badge>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {format(new Date(inv.created_at), "MMM d, yyyy")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ─── Billing Tab ─── */
const pricingPlans = [
  {
    title: "Early Adopter Special",
    price: "₹1,000",
    note: "First 10 customers only. Locked in for 12 months.",
    features: ["Up to 5 agents", "5 users", "All core features"],
    button: "Get This Deal",
    href: "https://rzp.io/rzp/lcctyRF",
    highlighted: true,
  },
  {
    title: "Starter",
    price: "₹2,500",
    features: ["Up to 5 agents", "5 users", "All core features"],
    button: "Choose Starter",
    href: "https://rzp.io/rzp/HDHKbdV",
  },
  {
    title: "Growth",
    price: "₹6,500",
    features: ["Up to 20 agents", "25 users", "Priority support"],
    button: "Choose Growth",
    href: "https://rzp.io/rzp/PSHAtdw",
  },
];

function BillingTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {pricingPlans.map((plan) => (
        <Card
          key={plan.title}
          className={cn(
            "relative flex flex-col",
            plan.highlighted && "border-primary shadow-lg ring-2 ring-primary/20"
          )}
        >
          {plan.highlighted && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-primary text-primary-foreground">
                <Sparkles className="h-3 w-3 mr-1" /> Most Popular
              </Badge>
            </div>
          )}
          <CardHeader className="text-center pt-8">
            <CardTitle className="text-lg">{plan.title}</CardTitle>
            <div className="mt-2">
              <span className="text-3xl font-bold text-foreground">{plan.price}</span>
              <span className="text-muted-foreground text-sm">/month</span>
            </div>
            {plan.note && (
              <p className="text-xs text-muted-foreground mt-1">{plan.note}</p>
            )}
          </CardHeader>
          <CardContent className="flex-1 space-y-3">
            <ul className="space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
          <div className="p-6 pt-0">
            <Button
              className="w-full"
              variant={plan.highlighted ? "default" : "outline"}
              asChild
            >
              <a href={plan.href} target="_blank" rel="noopener noreferrer">
                {plan.button}
              </a>
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
