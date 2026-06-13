import { redirect } from "next/navigation";

/** Merged into listener page — redirect old Zoom audio-out links. */
export default function AudioOutPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/session/${params.id}/listen`);
}
