import { Suspense } from "react";
import { AuthUI } from "@/components/ui/auth-fuse";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthUI defaultMode="signin" />
    </Suspense>
  );
}
