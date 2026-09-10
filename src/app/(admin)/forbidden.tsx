import { PermissionDenied } from "@/components/ui/states";

export default function Forbidden() {
  return (
    <div className="hm-card">
      <PermissionDenied module="this module" />
    </div>
  );
}
