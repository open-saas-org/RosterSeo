"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Mirrors nav-user.tsx's handleLogOut exactly (same authClient.signOut()
// call, same post-signout navigation) - this is just a second, more
// discoverable entry point on the Settings page. Do not diverge from that
// logic; if it changes there, change it here too.
export function SignOutButton() {
  const router = useRouter();

  async function handleLogOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={handleLogOut}>
      <LogOut />
      Sign out
    </Button>
  );
}
