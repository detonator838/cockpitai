import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrgProfile } from "@/hooks/useOrgName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead, useTableSort } from "@/components/SortableTableHead";
import { Check, X, Search, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const riskColors: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  high: "bg-red-100 text-red-800 border-red-200",
};

type ApprovalRow = {
  id: string;
  agent_id: string;
  event_id: string;
  status: string;
  created_at: string;
  agents: { name: string; risk_level: string } | null;
  events: { title: string } | null;
};

export default function Approvals() {
  const { user } = useAuth();
  const { orgId } = useOrgProfile();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, onSort, sortFn } = useTableSort("created_at", "desc");

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ["approvals", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("approval_requests")
        .select("id, agent_id, event_id, status, created_at, agents(name, risk_level), events:event_id(title)")
        .eq("organization_id", orgId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ApprovalRow[];
    },
  });

  const handleDecision = useMutation({
    mutationFn: async ({ id, eventId, agentId, decision }: { id: string; eventId: string; agentId: string; decision: "approved" | "rejected" }) => {
      const { error: approvalErr } = await supabase
        .from("approval_requests")
        .update({
          status: decision,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (approvalErr) throw approvalErr;

      const { error: eventErr } = await supabase
        .from("events")
        .update({ status: decision } as any)
        .eq("id", eventId);
      if (eventErr) throw eventErr;

      const { error: auditErr } = await supabase
        .from("audit_log")
        .insert({
          organization_id: orgId!,
          user_id: user!.id,
          action: decision === "approved" ? "approval.approved" : "approval.rejected",
          target_type: "approval_request",
          target_id: id,
          metadata: { agent_id: agentId },
        } as any);
      if (auditErr) throw auditErr;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-events"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-pending"] });
      toast.success(`Request ${vars.decision}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const q = search.toLowerCase();
  const filtered = approvals.filter((a) => {
    if (!q) return true;
    const agentName = a.agents?.name || "";
    const eventTitle = a.events?.title || "";
    return agentName.toLowerCase().includes(q) || eventTitle.toLowerCase().includes(q);
  });

  // Map nested fields for sorting
  const mappedForSort = filtered.map((a) => ({
    ...a,
    agentName: a.agents?.name || "",
    riskLevel: a.agents?.risk_level || "",
    actionRequested: a.events?.title || "",
  }));
  const sorted = sortFn(mappedForSort);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Approvals</h1>
        <p className="mt-1 text-muted-foreground">Review and approve pending agent actions.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by agent or action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Agent Name" sortKey="agentName" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Action Requested" sortKey="actionRequested" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Risk Level" sortKey="riskLevel" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Requested At" sortKey="created_at" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Actions" sortKey="" currentSort="" currentDir="asc" onSort={() => {}} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <CheckCircle className="h-10 w-10 opacity-40" />
                    <p className="text-lg font-medium">You're all caught up.</p>
                    <p className="text-sm">No pending approvals.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.agents?.name || "Unknown"}</TableCell>
                  <TableCell>{a.events?.title || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={riskColors[a.agents?.risk_level || "low"]}>
                      {(a.agents?.risk_level || "low").charAt(0).toUpperCase() + (a.agents?.risk_level || "low").slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        onClick={() => handleDecision.mutate({ id: a.id, eventId: a.event_id, agentId: a.agent_id, decision: "approved" })}
                        disabled={handleDecision.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-700 border-red-300 hover:bg-red-50"
                        onClick={() => handleDecision.mutate({ id: a.id, eventId: a.event_id, agentId: a.agent_id, decision: "rejected" })}
                        disabled={handleDecision.isPending}
                      >
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </div>
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
