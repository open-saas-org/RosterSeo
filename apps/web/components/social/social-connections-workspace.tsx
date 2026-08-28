"use client";

import { useState } from "react";
import { SocialConnectCard } from "./social-connect-card";
import type { SocialConnectionView, SocialPlatformDefView } from "./types";

export function SocialConnectionsWorkspace({
  projectId,
  platforms,
  initialConnections,
}: {
  projectId: string;
  platforms: SocialPlatformDefView[];
  initialConnections: SocialConnectionView[];
}) {
  const [connections, setConnections] = useState(initialConnections);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {platforms.map((platform) => (
        <SocialConnectCard
          key={platform.id}
          projectId={projectId}
          platform={platform}
          connections={connections.filter((c) => c.platform === platform.id)}
          onConnectionsChange={(next) => setConnections((prev) => [...prev.filter((c) => c.platform !== platform.id), ...next])}
        />
      ))}
    </div>
  );
}
