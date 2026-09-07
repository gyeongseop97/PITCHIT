import { clerkMiddleware } from "@clerk/nextjs/server";

// Pages remain public: guests can play normally.  This middleware only makes
// the signed-in Google session available to the profile and match APIs.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)",
    "/(api|trpc)(.*)",
  ],
};
