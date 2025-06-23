import { useRouter } from "expo-router";
import React from "react";

export default function Index() {
  const router = useRouter();
  React.useEffect(() => {
    // Use setTimeout to ensure navigation happens after mount
    const timeout = setTimeout(() => {
      router.replace("/Home");
    }, 0);
    return () => clearTimeout(timeout);
  }, [router]);
  return null;
}
