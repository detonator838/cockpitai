import {
  LayoutDashboard,
  Bot,
  Inbox,
  CheckSquare,
  FileText,
  Settings,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Link } from "react-router-dom";
import { useOrgProfile } from "@/hooks/useOrgName";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Approvals", url: "/approvals", icon: CheckSquare },
  { title: "Audit Log", url: "/audit-log", icon: FileText },
];

const bottomItems = [
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { orgName } = useOrgProfile();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4">
        <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
            <LayoutDashboard className="h-4 w-4 text-accent" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-semibold text-sidebar-primary leading-tight">
                Cockpit
              </span>
              <span className="text-[10px] text-sidebar-muted leading-none">{orgName}</span>
            </div>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted text-xs uppercase tracking-wider">
            Main
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                      activeClassName="bg-[hsl(199,89%,48%/0.2)] text-[hsl(199,89%,48%)] font-medium border-l-2 border-[hsl(199,89%,48%)]"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {bottomItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  activeClassName="bg-[hsl(199,89%,48%/0.2)] text-[hsl(199,89%,48%)] font-medium border-l-2 border-[hsl(199,89%,48%)]"
                >
                  <item.icon className="mr-2 h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
