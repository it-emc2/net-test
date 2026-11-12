// Toasts (shadcn/ui uses sonner): short messages that appear at the top and go away by
// themselves; errors stay until they are closed. `toast` is what features call.
import { Toaster as Sonner, toast } from "sonner";

export { toast };

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: "!bg-card !text-card-foreground !border-2 !border-border !rounded-lg !text-base !shadow-lg",
          error: "!border-destructive",
          success: "!border-success",
        },
      }}
    />
  );
}
