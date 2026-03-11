import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Bot, ShieldAlert, Mail, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

const severityColors: Record<string, string> = {
  info: "bg-sky-100 text-sky-800 border-sky-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
  critical: "bg-purple-100 text-purple-800 border-purple-200",
};

const Index = () => {
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
      return data as any[];
    },
  });

  const stats = [
    { title: "Total Agents", value: agentCount, icon: Bot, sub: "Registered agents" },
    { title: "Pending Approvals", value: pendingCount, icon: ShieldAlert, sub: "Awaiting review" },
    { title: "Unread Events", value: unreadCount, icon: Mail, sub: "In your inbox" },
    { title: "Errors Today", value: errorsToday, icon: AlertTriangle, sub: "Error + Critical" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">Overview of your organization's AI agents.</p>
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

      {/* Agent event counts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agent Activity (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Events (7d)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentsWithCounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No agents yet.</TableCell>
                </TableRow>
              ) : (
                agentsWithCounts.map((a) => (
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
        </CardContent>
      </Card>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No events yet.</TableCell>
                </TableRow>
              ) : (
                recentEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.agents?.name || "Unknown"}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
