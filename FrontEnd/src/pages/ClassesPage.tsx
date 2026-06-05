import { DashboardLayout } from "@/components/DashboardLayout";
import { useClasses, useCreateClass, useDeleteClass, useUpdateClass, useSubmissions } from "@/hooks/useData";
import { BookOpen, Plus, Trash2, FileText, BarChart3, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const ClassesPage = () => {
  const { data: classes, isLoading } = useClasses();
  const { data: submissions } = useSubmissions();
  const createClass = useCreateClass();
  const updateClass = useUpdateClass();
  const deleteClass = useDeleteClass();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return toast.error("Name is required");
    try {
      await createClass.mutateAsync({ name: name.trim(), description: description.trim() || undefined });
      toast.success("Class created");
      setOpen(false);
      setName("");
      setDescription("");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const getClassStats = (classId: string) => {
    const classSubs = submissions?.filter(s => s.class_id === classId) || [];
    const evaluated = classSubs.filter(s => s.evaluations?.length > 0);
    const avgScore = evaluated.length
      ? Math.round(
          evaluated.reduce((sum, s) => {
            const ev = s.evaluations[0];
            return sum + (ev.max_possible_score ? (Number(ev.total_score) / Number(ev.max_possible_score)) * 100 : 0);
          }, 0) / evaluated.length
        )
      : null;
    return { totalSubmissions: classSubs.length, avgScore };
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Classes</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage your courses and assignments</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New Class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Class</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Name</label>
                  <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. COMP1010" />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <Textarea className="mt-1" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
                </div>
                <Button onClick={handleCreate} disabled={createClass.isPending} className="w-full">
                  {createClass.isPending ? "Creating..." : "Create Class"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">Loading...</div>
        ) : classes && classes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((c) => {
              const stats = getClassStats(c.id);
              return (
                <div
                  key={c.id}
                  className="bg-card rounded-xl border border-border p-5 hover:shadow-md transition-all cursor-pointer group"
                  onClick={() => navigate(`/classes/${c.id}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditing({ id: c.id, name: c.name, description: c.description ?? "" });
                        }}
                        className="text-muted-foreground hover:text-primary transition-colors p-1"
                        aria-label="Edit class"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteClass.mutateAsync(c.id).then(() => toast.success("Deleted")).catch((err: any) => toast.error(err.message));
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        aria-label="Delete class"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{c.name}</h3>
                  {c.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{stats.totalSubmissions} submissions</span>
                    </div>
                    {stats.avgScore !== null && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>Avg {stats.avgScore}%</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border p-16 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-medium text-foreground mb-1">No classes yet</h3>
            <p className="text-sm text-muted-foreground">Create your first class to start managing assignments and submissions.</p>
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Class</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">Name</label>
                  <Input className="mt-1" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground">Description</label>
                  <Textarea className="mt-1" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </div>
                <Button
                  onClick={async () => {
                    if (!editing.name.trim()) return toast.error("Name is required");
                    try {
                      await updateClass.mutateAsync({ id: editing.id, name: editing.name.trim(), description: editing.description.trim() || undefined });
                      toast.success("Class updated");
                      setEditing(null);
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  disabled={updateClass.isPending}
                  className="w-full"
                >
                  {updateClass.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ClassesPage;
