import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgProfile } from "@/hooks/useOrgName";
import { Bot, ShieldAlert, Mail, AlertTriangle, Plus, Inbox as InboxIcon, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SortableTableHead, useTableSort } from "@/components/SortableTableHead";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const severityColors: Record<string, string> = {
  info: "bg-sky-100 text-sky-800 border-sky-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
  critical: "bg-purple-100 text-purple-800 border-purple-200",
};

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

const Index = () => {
  const { user } = useAuth();
  const { orgId, orgName } = useOrgProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [agentSearch, setAgentSearch] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const agentSort = useTableSort("name");
  const eventSort = useTableSort("created_at", "desc");

  // Add Agent modal state
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("custom");
  const [newRisk, setNewRisk] = useState("low");
  const [newDesc, setNewDesc] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Total agents
  const { data: agentCount = 0 } = useQuery({
    queryKey: ["dashboard-agents", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("agents")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Pending approvals
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ["dashboard-pending", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("approval_requests")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Unread events
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["dashboard-unread", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .eq("read", false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Errors today
  const { data: errorsToday = 0 } = useQuery({
    queryKey: ["dashboard-errors", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count, error } = await supabase
        .from("events")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId!)
        .in("severity", ["error", "critical"])
        .gte("created_at", todayStart.toISOString());
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Agents with 7-day event counts
  const { data: agentsWithCounts = [] } = useQuery({
    queryKey: ["dashboard-agent-events", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data: agents, error: agentsErr } = await supabase
        .from("agents")
        .select("id, name, type, status, risk_level")
        .eq("organization_id", orgId!);
      if (agentsErr) throw agentsErr;
      const { data: events, error: eventsErr } = await supabase
        .from("events")
        .select("agent_id")
        .eq("organization_id", orgId!)
        .gte("created_at", sevenDaysAgo.toISOString());
      if (eventsErr) throw eventsErr;
      const countMap: Record<string, number> = {};
      for (const e of events || []) {
        countMap[e.agent_id] = (countMap[e.agent_id] || 0) + 1;
      }
      return (agents || []).map((a) => ({
        ...a,
        eventCount: countMap[a.id] || 0,
      }));
    },
  });

  // Last 10 events
  const { data: recentEvents = [] } = useQuery({
    queryKey: ["dashboard-recent", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, severity, status, created_at, agents(name)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data as any[]).map((e) => ({ ...e, agentName: e.agents?.name || "Unknown" }));
    },
  });

  const createAgent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("agents")
        .insert({
          name: newName,
          type: newType,
          risk_level: newRisk,
          description: newDesc,
          owner_email: newEmail,
          organization_id: orgId!,
          created_by: user!.id,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-agents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-agent-events"] });
      toast.success("Agent created");
      setAddOpen(false);
      setNewName(""); setNewType("custom"); setNewRisk("low"); setNewDesc(""); setNewEmail("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const stats = [
    { title: "Total Agents", value: agentCount, icon: Bot, sub: "Registered agents" },
    { title: "Pending Approvals", value: pendingCount, icon: ShieldAlert, sub: "Awaiting review" },
    { title: "Unread Events", value: unreadCount, icon: Mail, sub: "In your inbox" },
    { title: "Errors Today", value: errorsToday, icon: AlertTriangle, sub: "Error + Critical" },
  ];

  // Filter + sort agents
  const aq = agentSearch.toLowerCase();
  const filteredAgents = agentsWithCounts.filter((a) => !aq || a.name.toLowerCase().includes(aq) || a.type.toLowerCase().includes(aq));
  const sortedAgents = agentSort.sortFn(filteredAgents);

  // Filter + sort events
  const eq = eventSearch.toLowerCase();
  const filteredEvents = recentEvents.filter((e: any) => !eq || e.title.toLowerCase().includes(eq) || e.agentName.toLowerCase().includes(eq));
  const sortedEvents = eventSort.sortFn(filteredEvents);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Overview of {orgName}'s AI agents.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="flex gap-3">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add New Agent
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Agent</DialogTitle>
              <DialogDescription>Create a new AI agent for your organization.</DialogDescription>
            </DialogHeader>
            <form className="space-y-4 py-4" onSubmit={(e) => { e.preventDefault(); createAgent.mutate(); }}>
              <div className="space-y-2">
                <Label htmlFor="dName">Agent Name</Label>
                <Input id="dName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="My Agent" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AGENT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Risk Level</Label>
                  <Select value={newRisk} onValueChange={setNewRisk}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RISK_LEVELS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="What does this agent do?" />
              </div>
              <div className="space-y-2">
                <Label>Owner Email</Label>
                <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="owner@company.com" required />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createAgent.isPending}>
                  {createAgent.isPending ? "Creating…" : "Create Agent"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Button variant="outline" onClick={() => navigate("/inbox")}>
          <InboxIcon className="h-4 w-4 mr-2" /> View Inbox
        </Button>
      </div>

      {/* Agent event counts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agent Activity (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search agents…" value={agentSearch} onChange={(e) => setAgentSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="-mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Agent" sortKey="name" currentSort={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                  <SortableTableHead label="Type" sortKey="type" currentSort={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                  <SortableTableHead label="Risk" sortKey="risk_level" currentSort={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                  <SortableTableHead label="Status" sortKey="status" currentSort={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} />
                  <SortableTableHead label="Events (7d)" sortKey="eventCount" currentSort={agentSort.sortKey} currentDir={agentSort.sortDir} onSort={agentSort.onSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAgents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No agents yet.</TableCell>
                  </TableRow>
                ) : (
                  sortedAgents.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="capitalize">{a.type}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          a.risk_level === "high" ? "bg-red-100 text-red-800 border-red-200"
                          : a.risk_level === "medium" ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200"
                        }>
                          {a.risk_level.charAt(0).toUpperCase() + a.risk_level.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          a.status === "active"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "bg-muted text-muted-foreground border-border"
                        }>
                          {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{a.eventCount}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Events</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search events…" value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="-mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Agent" sortKey="agentName" currentSort={eventSort.sortKey} currentDir={eventSort.sortDir} onSort={eventSort.onSort} />
                  <SortableTableHead label="Event" sortKey="title" currentSort={eventSort.sortKey} currentDir={eventSort.sortDir} onSort={eventSort.onSort} />
                  <SortableTableHead label="Severity" sortKey="severity" currentSort={eventSort.sortKey} currentDir={eventSort.sortDir} onSort={eventSort.onSort} />
                  <SortableTableHead label="Status" sortKey="status" currentSort={eventSort.sortKey} currentDir={eventSort.sortDir} onSort={eventSort.onSort} />
                  <SortableTableHead label="Time" sortKey="created_at" currentSort={eventSort.sortKey} currentDir={eventSort.sortDir} onSort={eventSort.onSort} className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No events yet.</TableCell>
                  </TableRow>
                ) : (
                  sortedEvents.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.agentName}</TableCell>
                      <TableCell>{e.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={severityColors[e.severity]}>
                          {e.severity.charAt(0).toUpperCase() + e.severity.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          e.status === "pending_approval" ? "bg-amber-100 text-amber-800 border-amber-200"
                          : e.status === "approved" ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : e.status === "rejected" ? "bg-red-100 text-red-800 border-red-200"
                          : "bg-muted text-muted-foreground border-border"
                        }>
                          {e.status === "pending_approval" ? "Pending" : e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
