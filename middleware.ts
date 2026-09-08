import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Pages remain public: guests can play normally.  This middleware only makes
// the signed-in Google session available to the profile and match APIs.
// An accidentally disconnected Marketplace integration must not make the
// whole ballgame return a 500.  Guests can still play; sign-in resumes as
// soon as both Clerk keys are restored in Vercel.
const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
