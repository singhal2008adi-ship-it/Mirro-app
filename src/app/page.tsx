"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import MagicMirror from "@/components/MagicMirror";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!auth);
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        setUser(currentUser);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (!auth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Configuration Required</h1>
        <p className="text-gray-500 mb-6">Please add your Firebase environment variables to Vercel or `.env.local` to start using Mirrio.</p>
        <div className="bg-gray-100 p-4 rounded-xl text-xs font-mono text-left w-full max-w-md">
          NEXT_PUBLIC_FIREBASE_API_KEY=...<br/>
          NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-6 flex flex-col">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-black">Mirrio</h1>
        <button
          onClick={() => auth && signOut(auth)}
          className="text-sm font-medium text-gray-500 hover:text-black transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="flex-1 pb-10">
        <p className="text-gray-500 mb-6 font-medium">Welcome back, {user?.displayName || "User"}</p>
        <MagicMirror />
      </main>
    </div>
  );
}
