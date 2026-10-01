import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function Layout() {
    return (
        <div className="flex min-h-dvh w-full">
            <Sidebar />
            <div className="min-w-0 flex-1">
                <Outlet />
            </div>
        </div>
    );
}
