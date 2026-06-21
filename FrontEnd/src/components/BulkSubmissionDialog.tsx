import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, Loader2, Trash2, ChevronRight, CheckCircle, User } from "lucide-react";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface QueuedSubmission {
  studentId: string;
  studentName: string;
  fileName: string;
  content: string;
  file?: File;
}

interface BulkSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classStudents: any[];
  onSubmitAll: (items: { studentId: string; studentName: string; content: string; file?: File }[]) => Promise<void>;
  parsePdfUrl: string;
  anonKey: string;
}

export function BulkSubmissionDialog({ open, onOpenChange, classStudents, onSubmitAll, parsePdfUrl, anonKey }: BulkSubmissionDialogProps) {
  const [queue, setQueue] = useState<QueuedSubmission[]>([]);
  const [currentStudentId, setCurrentStudentId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pasteContent, setPasteContent] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStudent = classStudents?.find((cs: any) => cs.student_id === currentStudentId);
  const usedStudentIds = new Set(queue.map(q => q.studentId));
  const availableStudents = classStudents?.filter((cs: any) => !usedStudentIds.has(cs.student_id)) || [];

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") { toast.error("Please upload a PDF file"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20MB"); return; }
    if (!currentStudentId) { toast.error("Select a student first"); return; }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(parsePdfUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${anonKey}` },
        body: formData,
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to parse PDF");
      }
      const { text } = await response.json();

      setQueue(prev => [...prev, {
        studentId: currentStudentId,
        studentName: currentStudent?.students?.name || "Unknown",
        fileName: file.name,
        content: text,
        file,
      }]);
      setCurrentStudentId("");
      setPasteContent("");
      toast.success(`${file.name} added to queue`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }, [currentStudentId, currentStudent, parsePdfUrl, anonKey]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (currentStudentId) setDragging(true);
  }, [currentStudentId]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleAddPastedContent = () => {
    if (!currentStudentId) return toast.error("Select a student first");
    if (!pasteContent.trim()) return toast.error("Paste some content first");
    setQueue(prev => [...prev, {
      studentId: currentStudentId,
      studentName: currentStudent?.students?.name || "Unknown",
      fileName: "Pasted text",
      content: pasteContent.trim(),
    }]);
    setCurrentStudentId("");
    setPasteContent("");
    toast.success("Text added to queue");
  };

  const handleRemoveFromQueue = (index: number) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitAll = async () => {
    if (queue.length === 0) return toast.error("No submissions in the queue");
    setSubmitting(true);
    try {
      await onSubmitAll(queue.map(q => ({
        studentId: q.studentId,
        studentName: q.studentName,
        content: q.content,
        file: q.file,
      })));
      setQueue([]);
      setCurrentStudentId("");
      setPasteContent("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (val: boolean) => {
    if (!val && queue.length > 0 && !submitting) {
      if (!confirm("You have queued submissions. Discard them?")) return;
      setQueue([]);
    }
    setCurrentStudentId("");
    setPasteContent("");
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[75vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle>Bulk Upload Submissions</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex min-h-0">
          {/* LEFT: Student list & queue */}
          <div className="w-[280px] border-r border-border flex flex-col">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Students ({classStudents?.length || 0})
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-0.5">
                {classStudents?.map((cs: any) => {
                  const isQueued = usedStudentIds.has(cs.student_id);
                  const isSelected = currentStudentId === cs.student_id;
                  return (
                    <button
                      key={cs.student_id}
                      disabled={isQueued}
                      onClick={() => !isQueued && setCurrentStudentId(cs.student_id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? "bg-primary/10 border border-primary/30"
                          : isQueued
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-accent/50 cursor-pointer"
                      }`}
                    >
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium ${
                        isQueued ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                      }`}>
                        {isQueued ? <CheckCircle className="h-3.5 w-3.5" /> : cs.students?.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${isSelected ? "font-semibold text-foreground" : "text-foreground"}`}>
                          {cs.students?.name || "Unknown"}
                        </p>
                        {isQueued && (
                          <p className="text-[10px] text-success truncate">
                            {queue.find(q => q.studentId === cs.student_id)?.fileName}
                          </p>
                        )}
                      </div>
                      {isQueued && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const idx = queue.findIndex(q => q.studentId === cs.student_id);
                            if (idx !== -1) handleRemoveFromQueue(idx);
                          }}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            {/* Queue summary */}
            <div className="px-4 py-3 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{queue.length}</span> / {classStudents?.length || 0} queued
              </p>
            </div>
          </div>

          {/* RIGHT: Upload area */}
          <div className="flex-1 flex flex-col p-5 min-w-0">
            {currentStudentId ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{currentStudent?.students?.name}</p>
                    <p className="text-xs text-muted-foreground">Upload PDF or paste text below</p>
                  </div>
                </div>

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all flex-1 flex flex-col items-center justify-center cursor-pointer ${
                    dragging
                      ? "border-primary bg-primary/5 scale-[1.01]"
                      : "border-border hover:border-primary/50 hover:bg-accent/30"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <p className="text-sm">Extracting text from PDF...</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Upload className="h-6 w-6 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        {dragging ? "Drop PDF here" : "Drag & drop PDF here"}
                      </p>
                      <p className="text-xs text-muted-foreground">or click to browse · PDF up to 20MB</p>
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="relative my-3">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background px-2 text-muted-foreground">or paste text</span>
                  </div>
                </div>

                {/* Paste area */}
                <Textarea
                  className="min-h-[80px] resize-none"
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste the student's submission text here..."
                />
                {pasteContent.trim() && (
                  <Button size="sm" className="mt-2 self-end" onClick={handleAddPastedContent}>
                    Add to Queue
                  </Button>
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Select a student</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Click a student from the list on the left to upload their submission
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            {queue.length} submission{queue.length !== 1 ? "s" : ""} ready
          </p>
          <Button onClick={handleSubmitAll} disabled={queue.length === 0 || submitting}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Submitting...</>
            ) : (
              <><ChevronRight className="h-4 w-4 mr-1" /> Submit All ({queue.length})</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
