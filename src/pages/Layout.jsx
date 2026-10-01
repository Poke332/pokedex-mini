import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function Layout() {
    return (
        // Mobile: stack the nav band above the content (flex-col) so the
        // chips can't push main to 0 width; desktop: the usual side-by-side
        // rail. The mobile nav's own overflow-x-auto scrolls its chips inside
        // its box once it has a real full-width row.
        <div className="flex min-h-dvh w-full flex-col md:flex-row">
            <Sidebar />
            <div className="min-w-0 flex-1">
                <Outlet />
            </div>
        </div>
    );
}
