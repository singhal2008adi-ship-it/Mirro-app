"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { Users, LogOut, Search, Clock, ShieldAlert } from "lucide-react";

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  lastLogin: string;
}

export default function AdminPanel() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const router = useRouter();

  // If you want to restrict this later, you can add an array of emails here
  // const ADMIN_EMAILS = ["your.email@example.com"];
  // For now, any authenticated user can view the basic admin panel to verify it works.

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoadingConfig(false);
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        // Add basic admin check logic here if needed:
        // setIsAdmin(ADMIN_EMAILS.includes(currentUser.email || ""));
        setIsAdmin(true); 
        fetchUsers();
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchUsers = async () => {
    if (!db) return;
    setLoadingData(true);
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const users: UserProfile[] = [];
      querySnapshot.forEach((doc) => {
        users.push(doc.data() as UserProfile);
      });
      // Sort by latest login
      users.sort((a, b) => new Date(b.lastLogin).getTime() - new Date(a.lastLogin).getTime());
      setUsersList(users);
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoadingData(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-6 text-center">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-6" />
        <h1 className="text-3xl font-bold tracking-tight text-black mb-4">Access Denied</h1>
        <p className="text-gray-500 text-lg mb-8 max-w-sm">
          You do not have administrator privileges to view this page.
        </p>
        <button 
          onClick={() => router.push("/")}
          className="bg-black text-white px-8 py-3 rounded-2xl font-semibold"
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] p-8 max-w-6xl mx-auto font-sans">
      <header className="flex justify-between items-center mb-10 pb-6 border-b border-gray-200">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-black flex items-center gap-3">
            <Users className="w-8 h-8" /> Control Panel
          </h1>
          <p className="text-gray-500 mt-2">Manage Mirrio users and viewing stats</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-black">{user?.displayName}</p>
            <p className="text-xs text-gray-400">Administrator</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {user?.photoURL && <img src={user.photoURL} alt="Admin profile" className="w-10 h-10 rounded-full bg-white border border-gray-200 shadow-sm" />}
        </div>
      </header>

      <section className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <h2 className="text-xl font-bold text-black flex items-center gap-2">
            Registered Users ({usersList.length})
          </h2>
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search email or name..." 
              className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        </div>

        {loadingData ? (
          <div className="py-20 flex justify-center">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : usersList.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p>No users found in Firestore yet.</p>
            <p className="text-sm mt-1">Users will appear here after they log in to Mirrio.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400 font-bold">
                  <th className="pb-4 pr-4">Profile</th>
                  <th className="pb-4 pr-4">User Details</th>
                  <th className="pb-4 pr-4">User ID</th>
                  <th className="pb-4">Last Login</th>
                </tr>
              </thead>
              <tbody>
                {usersList.map((u, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-4 pr-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {u.photoURL ? <img src={u.photoURL} className="w-10 h-10 rounded-full" alt="" /> : <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-bold">{u.displayName?.[0] || '?'}</div>}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-bold text-sm text-black">{u.displayName}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </td>
                    <td className="py-4 pr-4 text-xs font-mono text-gray-400">
                      {u.uid}
                    </td>
                    <td className="py-4 text-xs font-medium text-gray-600 flex items-center gap-1.5 mt-2">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(u.lastLogin).toLocaleDateString()} {new Date(u.lastLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
