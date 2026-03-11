import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const severityColors: Record<string, string> = {
  info: "bg-sky-100 text-sky-800 border-sky-200",
  warning: "bg-amber-100 text-amber-800 border-amber-200",
  error: "bg-red-100 text-red-800 border-red-200",
  critical: "bg-purple-100 text-purple-800 border-purple-200",
};

const statusColors: Record<string, string> = {
  logged: "bg-muted text-muted-foreground border-border",
  pending_approval: "bg-amber-100 text-amber-800 border-amber-200",
  approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

type EventRow = {
  id: string;
  agent_id: string;
  event_type: string;
  title: string;
  severity: string;
  status: string;
  read: boolean;
  created_at: string;
  agents: { name: string } | null;
};

export default function InboxPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

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

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["inbox-events", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, agent_id, event_type, title, severity, status, read, created_at, agents(name)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as EventRow[];
    },
  });

  // Unique agents for filter
  const agentOptions = Array.from(
    new Map(events.map((e) => [e.agent_id, e.agents?.name || "Unknown"])).entries()
  );

  // Filtered events
  const filtered = events.filter((e) => {
    if (agentFilter !== "all" && e.agent_id !== agentFilter) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (severityFilter !== "all" && e.severity !== severityFilter) return false;
    return true;
  });

  const markRead = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("events")
        .update({ read: true } as any)
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inbox-events"] }),
  });

  const handleDecision = useMutation({
    mutationFn: async ({ eventId, agentId, decision }: { eventId: string; agentId: string; decision: "approved" | "rejected" }) => {
      // Update event status
      const { error: eventErr } = await supabase
        .from("events")
        .update({ status: decision } as any)
        .eq("id", eventId);
      if (eventErr) throw eventErr;

      // Update approval request
      const { error: approvalErr } = await supabase
        .from("approval_requests")
        .update({
          status: decision,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("event_id", eventId);
      if (approvalErr) throw approvalErr;

      // Write audit log
      const { error: auditErr } = await supabase
        .from("audit_log")
        .insert({
          organization_id: orgId!,
          user_id: user!.id,
          action: decision === "approved" ? "approval.approved" : "approval.rejected",
          target_type: "event",
          target_id: eventId,
          metadata: { agent_id: agentId },
        } as any);
      if (auditErr) throw auditErr;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["inbox-events"] });
      toast.success(`Event ${vars.decision}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Inbox</h1>
        <p className="mt-1 text-muted-foreground">Review events and approve actions from your agents.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Agents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            {agentOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="logged">Logged</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No events found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((event) => (
                <TableRow
                  key={event.id}
                  className={!event.read ? "bg-accent/30 cursor-pointer" : "cursor-pointer"}
                  onClick={() => {
                    if (!event.read) markRead.mutate(event.id);
                  }}
                >
                  <TableCell>
                    {!event.read && (
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{event.agents?.name || "Unknown"}</TableCell>
                  <TableCell>{event.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={severityColors[event.severity]}>
                      {event.severity.charAt(0).toUpperCase() + event.severity.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[event.status]}>
                      {event.status === "pending_approval"
                        ? "Pending"
                        : event.status.charAt(0).toUpperCase() + event.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {event.status === "pending_approval" && (
                      <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                          onClick={() =>
                            handleDecision.mutate({
                              eventId: event.id,
                              agentId: event.agent_id,
                              decision: "approved",
                            })
                          }
                          disabled={handleDecision.isPending}
                        >
                          <Check className="h-4 w-4 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-700 border-red-300 hover:bg-red-50"
                          onClick={() =>
                            handleDecision.mutate({
                              eventId: event.id,
                              agentId: event.agent_id,
                              decision: "rejected",
                            })
                          }
                          disabled={handleDecision.isPending}
                        >
                          <X className="h-4 w-4 mr-1" /> Reject
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
