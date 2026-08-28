"use client";

import { useState } from "react";
import { PublishConnectCard } from "./publish-connect-card";
import type { BlogConnectionView, BlogPlatformDefView } from "./types";

export function PublishConnectionsWorkspace({
  projectId,
  platforms,
  initialConnections,
}: {
  projectId: string;
  platforms: BlogPlatformDefView[];
  initialConnections: BlogConnectionView[];
}) {
  const [connections, setConnections] = useState(initialConnections);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {platforms.map((platform) => (
        <PublishConnectCard
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
