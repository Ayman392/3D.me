import { Suspense } from "react";
import { AuthUI } from "@/components/ui/auth-fuse";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthUI defaultMode="signup" />
    </Suspense>
  );
}
