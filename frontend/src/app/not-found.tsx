import { StatusScreen } from "@/components/ui/feedback";

export default function NotFound() {
  return (
    <main className="bg-canvas flex min-h-dvh items-center justify-center px-4">
      <StatusScreen kind="not-found" />
    </main>
  );
}
