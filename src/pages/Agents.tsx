import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SortableTableHead, useTableSort } from "@/components/SortableTableHead";
import { Plus, Copy, Check, Search, Pause, Play, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const AGENT_TYPES = [
  { value: "hubspot", label: "HubSpot" },
  { value: "zapier", label: "Zapier" },
  { value: "github", label: "GitHub" },
  { value: "intercom", label: "Intercom" },
  { value: "custom", label: "Custom" },
] as const;

const RISK_LEVELS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const riskColors: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-red-100 text-red-800 border-red-200",
};

const statusColors: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  paused: "bg-muted text-muted-foreground border-border",
};

type AgentRow = {
  id: string;
  name: string;
  type: string;
  risk_level: string;
  status: string;
  description: string;
  owner_email: string;
  webhook_secret: string;
  created_at: string;
};

export default function Agents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<AgentRow | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewAgent, setViewAgent] = useState<AgentRow | null>(null);
  const { sortKey, sortDir, onSort, sortFn } = useTableSort("created_at", "desc");

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("custom");
  const [riskLevel, setRiskLevel] = useState<string>("low");
  const [description, setDescription] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

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

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as AgentRow[];
    },
  });

  const createAgent = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .insert({
          name,
          type,
          risk_level: riskLevel,
          description,
          owner_email: ownerEmail,
          organization_id: orgId!,
          created_by: user!.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AgentRow;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setCreatedAgent(data);
      setName("");
      setType("custom");
      setRiskLevel("low");
      setDescription("");
      setOwnerEmail("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("agents")
        .update({ status: newStatus } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent status updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteAgent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agents").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const webhookUrl = (agentId: string) =>
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook/${agentId}`;

  const resetDialog = () => {
    setCreatedAgent(null);
    setOpen(false);
  };

  const q = search.toLowerCase();
  const filtered = agents.filter((a) => {
    if (!q) return true;
    return a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q) || a.owner_email.toLowerCase().includes(q);
  });
  const sorted = sortFn(filtered);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Agents</h1>
          <p className="mt-1 text-muted-foreground">Manage your organization's AI agents.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { if (!v) resetDialog(); else setOpen(true); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            {createdAgent ? (
              <>
                <DialogHeader>
                  <DialogTitle>Agent Created Successfully</DialogTitle>
                  <DialogDescription>Save the webhook URL and secret below. The secret won't be shown again.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Webhook URL</Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={webhookUrl(createdAgent.id)} className="font-mono text-xs" />
                      <Button size="icon" variant="outline" onClick={() => handleCopy(webhookUrl(createdAgent.id), "url")}>
                        {copiedField === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Webhook Secret</Label>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={createdAgent.webhook_secret} className="font-mono text-xs" />
                      <Button size="icon" variant="outline" onClick={() => handleCopy(createdAgent.webhook_secret, "secret")}>
                        {copiedField === "secret" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={resetDialog}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Add New Agent</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4 py-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createAgent.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="agentName">Agent Name</Label>
                    <Input id="agentName" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Agent" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select value={type} onValueChange={setType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AGENT_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Risk Level</Label>
                      <Select value={riskLevel} onValueChange={setRiskLevel}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RISK_LEVELS.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc">Description</Label>
                    <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this agent do?" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ownerEmail">Owner Email</Label>
                    <Input id="ownerEmail" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="owner@company.com" required />
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={createAgent.isPending}>
                      {createAgent.isPending ? "Creating…" : "Create Agent"}
                    </Button>
                  </DialogFooter>
                </form>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search agents…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Type" sortKey="type" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Risk Level" sortKey="risk_level" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Date Added" sortKey="created_at" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Actions" sortKey="" currentSort="" currentDir="asc" onSort={() => {}} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {search ? "No matching agents." : 'No agents yet. Click "Add New Agent" to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">{agent.name}</TableCell>
                  <TableCell className="capitalize">{agent.type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={riskColors[agent.risk_level]}>
                      {agent.risk_level.charAt(0).toUpperCase() + agent.risk_level.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[agent.status]}>
                      {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(agent.created_at), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className={agent.status === "active"
                          ? "text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          : "text-muted-foreground"}
                        onClick={() => toggleStatus.mutate({
                          id: agent.id,
                          newStatus: agent.status === "active" ? "paused" : "active",
                        })}
                        disabled={toggleStatus.isPending}
                      >
                        {agent.status === "active" ? (
                          <><Pause className="h-4 w-4 mr-1" /> Pause</>
                        ) : (
                          <><Play className="h-4 w-4 mr-1" /> Resume</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewAgent(agent)}
                      >
                        <Eye className="h-4 w-4 mr-1" /> View
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="outline" className="text-red-700 border-red-300 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{agent.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteAgent.mutate(agent.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* View Agent Side Panel */}
      <Sheet open={!!viewAgent} onOpenChange={(o) => { if (!o) setViewAgent(null); }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{viewAgent?.name}</SheetTitle>
          </SheetHeader>
          {viewAgent && (
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Webhook URL</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={webhookUrl(viewAgent.id)} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={() => handleCopy(webhookUrl(viewAgent.id), `view-url-${viewAgent.id}`)}>
                    {copiedField === `view-url-${viewAgent.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Webhook Secret</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={viewAgent.webhook_secret} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={() => handleCopy(viewAgent.webhook_secret, `view-secret-${viewAgent.id}`)}>
                    {copiedField === `view-secret-${viewAgent.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Description</Label>
                <p className="text-sm">{viewAgent.description || "No description."}</p>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Owner</Label>
                <p className="text-sm">{viewAgent.owner_email}</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
