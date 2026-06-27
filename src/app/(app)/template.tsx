// Re-mounts on every navigation within the (app) group, giving each page a
// subtle fade-slide entrance. Pure CSS (see globals.css .tt-page-in).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="tt-page-in">{children}</div>;
}
