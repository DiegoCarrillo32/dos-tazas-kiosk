import { PageHeaderSkeleton, StatCardsSkeleton } from "./_components/Skeletons";

export default function Loading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 sm:space-y-8">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={4} />
    </div>
  );
}
