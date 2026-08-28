"use client";

import { useState } from "react";
import { BusinessProfileForm } from "./business-profile-form";
import { BusinessProfileListing, type LocalBusinessProfile } from "./business-profile-listing";

export function BusinessProfileWorkspace({
  projectId,
  initialProfile,
}: {
  projectId: string;
  initialProfile: LocalBusinessProfile | null;
}) {
  const [profile, setProfile] = useState<LocalBusinessProfile | null>(initialProfile);
  const [showForm, setShowForm] = useState(initialProfile === null);

  if (profile && !showForm) {
    return (
      <BusinessProfileListing
        projectId={projectId}
        profile={profile}
        onResynced={setProfile}
        onChangeBusiness={() => setShowForm(true)}
      />
    );
  }

  return (
    <BusinessProfileForm
      projectId={projectId}
      onSaved={(saved) => {
        setProfile(saved);
        setShowForm(false);
      }}
    />
  );
}
