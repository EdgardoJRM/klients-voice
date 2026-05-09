import MagicVerifyClient from "./MagicVerifyClient";

export default function MagicLoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams.t;
  const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  return <MagicVerifyClient token={token} />;
}
