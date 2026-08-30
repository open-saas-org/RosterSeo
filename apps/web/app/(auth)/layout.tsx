import { Globe } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Globe className="size-4" />
        </div>
        RosterSEO
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
