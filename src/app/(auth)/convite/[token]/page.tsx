import type { Metadata } from "next";
import { InvitationFlow } from "./InvitationFlow";

export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InvitationFlow token={token} />;
}
