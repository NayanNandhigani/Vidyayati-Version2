import { redirect } from "next/navigation";

// Teaching isn't built yet, so it's switched off (MODULE_FLAGS.teaching in
// lib/module-flags.ts): an old bookmark or typed URL goes to the dashboard
// instead of an empty "hasn't been set up yet" page. Replace this with the
// real module (behind requireModuleAccess("Teaching", "VIEW")) when the
// flag is turned on.
export default function TeachingPage() {
  redirect("/app/dashboard");
}
