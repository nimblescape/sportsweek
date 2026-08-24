import { Suspense } from "react";
import { SignInButton } from "@/components/auth/sign-in-button";

export default function SignInPage() {
    return (
        <Suspense>
            <SignInButton />
        </Suspense>
    );
}
