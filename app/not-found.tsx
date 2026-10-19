import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5">
      <p className="text-sm text-text-3">404</p>
      <h1 className="mt-2 text-2xl text-text">This page took a different flight.</h1>
      <p className="mt-3 text-base text-text-2">Your progress is safe. Let&apos;s get you back to today&apos;s lesson.</p>
      <div className="mt-10">
        <LinkButton href="/" full>
          Back home
        </LinkButton>
      </div>
    </main>
  );
}
