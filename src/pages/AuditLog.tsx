import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead, useTableSort } from "@/components/SortableTableHead";
import { Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type AuditRow = {
  id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, any> | null;
  created_at: string;
  profiles: { full_name: string; email: string | null } | null;
  actor: string;
  details: string;
};

export default function AuditLog() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const { sortKey, sortDir, onSort, sortFn } = useTableSort("created_at", "desc");

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

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-log", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, user_id, action, target_type, target_id, metadata, created_at, profiles:user_id(full_name, email)")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]).map((log: any) => {
        const actor = log.profiles?.full_name || log.profiles?.email || "System";
        const parts = [`${log.target_type}:${log.target_id.slice(0, 8)}…`];
        if (log.metadata && Object.keys(log.metadata).length > 0) {
          const entries = Object.entries(log.metadata).slice(0, 2);
          for (const [k, v] of entries) {
            parts.push(`${k}=${typeof v === "string" ? v.slice(0, 20) : v}`);
          }
        }
        return { ...log, actor, details: parts.join(" · ") };
      }) as AuditRow[];
    },
  });

  const q = search.toLowerCase();
  const filtered = logs.filter((log) => {
    if (!q) return true;
    return log.actor.toLowerCase().includes(q) || log.action.toLowerCase().includes(q);
  });

  const sorted = sortFn(filtered);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Audit Log</h1>
        <p className="mt-1 text-muted-foreground">Read-only record of all actions in your organization.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by actor or action…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead label="Actor" sortKey="actor" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Action" sortKey="action" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Details" sortKey="details" currentSort={sortKey} currentDir={sortDir} onSort={onSort} />
              <SortableTableHead label="Time" sortKey="created_at" currentSort={sortKey} currentDir={sortDir} onSort={onSort} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {search ? "No matching entries." : "No audit log entries yet."}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.actor}</TableCell>
                  <TableCell>
                    <code className="text-sm bg-muted px-1.5 py-0.5 rounded">{log.action}</code>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                    {log.details}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
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
