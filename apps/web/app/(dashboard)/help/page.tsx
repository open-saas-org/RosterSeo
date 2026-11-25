import { BookOpen, GitFork, MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const DOCS_URL = "/docs";

// Real repo (see apps/docs/src/lib/shared.ts's gitConfig and package.json's
// "repository" field, both set to this same URL).
const GITHUB_CONFIGURED = true;
const GITHUB_URL = "https://github.com/open-saas-org/RosterSeo";

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Help & Community"
        description="Documentation, source code, and community resources."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-md bg-lavender/10">
              <BookOpen className="size-5 text-lavender" />
            </div>
            <CardTitle>Documentation</CardTitle>
            <CardDescription>
              Guides, architecture, and per-feature documentation for RosterSEO.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <a
              href={DOCS_URL}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Open docs
            </a>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-md bg-lavender/10">
              <GitFork className="size-5 text-lavender" />
            </div>
            <CardTitle>Source code</CardTitle>
            <CardDescription>Browse the repository, file issues, or contribute.</CardDescription>
          </CardHeader>
          <CardContent>
            {GITHUB_CONFIGURED ? (
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                View on GitHub
              </a>
            ) : (
              <>
                <span className="text-sm font-medium text-muted-foreground">View on GitHub</span>
                <Badge variant="outline" className="ml-2">
                  Coming soon
                </Badge>
                <p className="mt-1 text-xs text-muted-foreground">
                  This repo doesn&apos;t have a public GitHub URL configured yet.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex size-9 items-center justify-center rounded-md bg-lavender/10">
              <MessagesSquare className="size-5 text-lavender" />
            </div>
            <CardTitle>Community</CardTitle>
            <CardDescription>Ask questions and share feedback with other users.</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-sm font-medium text-muted-foreground">Discord / Discussions</span>
            <Badge variant="outline" className="ml-2">
              Coming soon
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">No community channel is set up yet.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
