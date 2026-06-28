import {
  LayoutDashboard,
  BookOpen,
  BarChart3,
  Bot,
  Settings,
  LogOut,
  UserCircle,
  Home,
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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const mainNav = [
  { title: "Home", url: "/", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
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
                  className={`flex items-center rounded-lg text-sm transition-colors ${collapsed ? "justify-center" : "gap-3 px-3"
                    } py-2 ${active
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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/login");
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  // Derive a short display name from the user object
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "User";
  const email = user?.email ?? "";

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

      <SidebarFooter className="p-3 space-y-2">
        {/* User info */}
        {!collapsed ? (
          <div className="rounded-lg bg-accent p-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <UserCircle className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{email}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <UserCircle className="h-4 w-4 text-primary" />
            </div>
          </div>
        )}

        {/* Sign Out button */}
        <SidebarMenuButton
          id="signout-btn"
          onClick={handleSignOut}
          tooltip="Sign Out"
          className={`flex items-center rounded-lg text-sm transition-colors text-muted-foreground hover:bg-destructive/10 hover:text-destructive w-full ${collapsed ? "justify-center px-2" : "gap-3 px-3"
            } py-2`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}
