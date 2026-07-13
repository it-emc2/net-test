import { Moon, Sun } from "lucide-react";
import type { ThemeName } from "@emc2/shared";
import { useTheme, THEMES } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Theme dropdown (named) + light/dark toggle, used in the app shell header. */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, mode, setTheme, toggleMode } = useTheme();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={theme} onValueChange={(v) => setTheme(v as ThemeName)}>
        <SelectTrigger className="w-[9.5rem]" aria-label="Design auswählen">
          <span className="flex items-center gap-2">
            <Swatch theme={theme} />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {THEMES.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <span className="flex items-center gap-2">
                <Swatch theme={t.id} />
                {t.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon"
        onClick={toggleMode}
        aria-label={mode === "dark" ? "Zu hellem Modus wechseln" : "Zu dunklem Modus wechseln"}
        title={mode === "dark" ? "Hell" : "Dunkel"}
      >
        {mode === "dark" ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}

/** A dot rendered under its own theme scope so it shows that theme's primary. */
function Swatch({ theme }: { theme: ThemeName }) {
  return <span data-theme={theme} className="size-3 shrink-0 rounded-full bg-primary" aria-hidden />;
}
