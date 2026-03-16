"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

interface SavedLook {
  id: string;
  imageUrl: string;
  createdAt: number;
}

export default function WardrobePage() {
  const [looks, setLooks] = useState<SavedLook[]>([]);
  const [loading, setLoading] = useState(!!auth);
  const router = useRouter();

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (!currentUser) {
        router.push("/login");
      } else {
        fetchLooks(currentUser.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const fetchLooks = async (userId: string) => {
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      const q = query(
        collection(db, "looks"),
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const fetchedLooks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedLook[];
      setLooks(fetchedLooks);
    } catch (error) {
      console.error("Error fetching looks:", error);
    } finally {
      setLoading(false);
    }
  };

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
        <div className="flex items-center gap-3">
          <Link href="/">
            <div className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
              <ArrowLeft className="w-5 h-5 text-black" />
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-black">Wardrobe</h1>
        </div>
        <Link href="/">
          <button className="bg-black text-white p-2 rounded-full shadow-md hover:bg-gray-800 transition-colors">
            <Plus className="w-5 h-5" />
          </button>
        </Link>
      </header>

      <main className="flex-1">
        {looks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center mt-20">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Plus className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-black mb-2">No looks yet</h2>
            <p className="text-gray-500">Go to the Magic Mirror to generate your first try-on.</p>
            <Link href="/">
              <button className="mt-6 bg-black text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors">
                Try it now
              </button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {looks.map((look) => (
              <div key={look.id} className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gray-100 shadow-sm border border-gray-200 group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={look.imageUrl} 
                  alt="Saved Try-on" 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
