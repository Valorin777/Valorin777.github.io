"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

/** A quiet pill at the top when the connection drops. Lessons keep working. */
export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return (
    <AnimatePresence>
      {offline && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center pt-safe"
        >
          <span className="mt-2 rounded-full bg-text px-3 py-1.5 text-xs text-bg shadow-2">
            Offline · lessons still work
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
