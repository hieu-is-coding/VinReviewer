import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";

const SettingsPage = () => {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your workspace preferences</p>
        </div>

        <div className="bg-card rounded-lg shadow-card border border-border p-6 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-foreground">Profile</h3>
            <p className="text-xs text-muted-foreground mt-1">Update your account details</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <input className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" defaultValue="Dr. Williams" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <input className="mt-1 w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" defaultValue="williams@university.edu" />
              </div>
            </div>
          </div>

          <hr className="border-border" />

          <div>
            <h3 className="text-sm font-medium text-foreground">AI Preferences</h3>
            <p className="text-xs text-muted-foreground mt-1">Configure evaluation behavior</p>
            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" defaultChecked className="rounded border-border" />
                <span className="text-sm text-foreground">Auto-flag low confidence submissions</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">

                <input type="checkbox" className="rounded border-border" />
                <span className="text-sm text-foreground">Require human review for all evaluations</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <Button size="sm">Save Changes</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
