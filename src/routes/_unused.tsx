import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_unused")({ component: Index });

function Index() {
  return <Navigate to="/" replace />;
}
