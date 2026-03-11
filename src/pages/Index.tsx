import { Bot, Inbox, CheckSquare, FileText, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { title: "Active Agents", value: "12", icon: Bot, change: "+2 this week" },
  { title: "Inbox Items", value: "34", icon: Inbox, change: "8 unread" },
  { title: "Pending Approvals", value: "7", icon: CheckSquare, change: "3 urgent" },
  { title: "Audit Events", value: "1,248", icon: FileText, change: "Last 30 days" },
];

const Index = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Welcome to Cockpit
        </h1>
        <p className="mt-2 text-muted-foreground">
          Your unified management dashboard for AI agents.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="group hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between p-6">
          <div>
            <h3 className="font-semibold text-foreground">Get Started</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your first AI agent to start managing workflows.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
};

export default Index;
