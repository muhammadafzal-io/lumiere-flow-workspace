import Link from "next/link";
import { Lock, LogIn } from "lucide-react";

/**
 * Shown in place of a page's content when its data fetch comes back 401/403.
 * Distinguishes "you're not signed in" from "you're signed in but not allowed" —
 * the two need different next steps for the user.
 */
export function AccessGate({ status }: { status: 401 | 403 }) {
  if (status === 401) {
    return (
      <div className="rounded-lg border bg-card p-10 text-center space-y-3">
        <LogIn className="h-8 w-8 mx-auto text-muted-foreground" />
        <h2 className="font-semibold">Please sign in</h2>
        <p className="text-sm text-muted-foreground">You need to be signed in to view this page.</p>
        <Link
          href="/login"
          className="inline-block text-sm font-medium text-primary underline underline-offset-2"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-10 text-center space-y-3">
      <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
      <h2 className="font-semibold">Access denied</h2>
      <p className="text-sm text-muted-foreground">
        Your account doesn&apos;t have permission to view this page. Contact your administrator if
        you think this is wrong.
      </p>
    </div>
  );
}
