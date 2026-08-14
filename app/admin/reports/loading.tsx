import { PageHeaderSkeleton } from "../_components/Skeletons";
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeaderSkeleton />
      <div className="bg-card p-6 rounded-2xl border border-warm-roast/10 shadow-sm max-w-2xl space-y-6">
        <Skeleton className="h-5 w-40" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
        <Skeleton className="h-11 w-full sm:w-48 rounded-md" />
      </div>
    </div>
  );
}
