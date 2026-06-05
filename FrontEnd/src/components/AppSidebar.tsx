import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  Bot,
  Settings,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Classes", url: "/classes", icon: BookOpen },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

function NavSection({ items }: { items: typeof mainNav }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = location.pathname === item.url || (item.url !== "/" && location.pathname.startsWith(item.url));
            return (
              <SidebarMenuItem key={item.title} className={collapsed ? "flex justify-center" : ""}>
                <SidebarMenuButton
                  onClick={() => navigate(item.url)}
                  tooltip={item.title}
                  className={`flex items-center rounded-lg text-sm transition-colors ${
                    collapsed ? "justify-center" : "gap-3 px-3"
                  } py-2 ${
                    active
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className={collapsed ? "p-2" : "p-4"}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5"}`}>
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-none">GradioAI</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">AI Evaluation Workspace</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <NavSection items={mainNav} />
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="rounded-lg bg-accent p-3">
            <p className="text-xs font-medium text-foreground">Free Plan</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">12/50 evaluations used</p>
            <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
              <div className="h-full w-[24%] rounded-full bg-primary" />
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
