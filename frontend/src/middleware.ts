import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)", "/sso-callback(.*)", "/features(.*)", "/pricing(.*)", "/about(.*)", "/team(.*)", "/mission(.*)", "/portal(.*)"]);
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request) && !isAuthRoute(request)) {
    return;
  }

  const { userId, redirectToSignIn } = await auth();

  if (userId && isAuthRoute(request)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!userId) {
    return redirectToSignIn();
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next|portal).*)", "/", "/(api|trpc)(.*)"],
};
