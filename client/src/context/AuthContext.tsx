// "use client";

// import React, { createContext, useContext, useEffect, useState } from "react";
// import { createClient, isSupabaseConfigured } from "@/utils/supabase/client";
// import { User } from "@supabase/supabase-js";
// import { signout } from "@/app/auth/actions";

// interface DevUser {
//   id: string;
//   email: string;
// }

// interface AuthContextType {
//   user: User | DevUser | null;
//   loading: boolean;
//   isConfigured: boolean;
//   signOut: () => Promise<void>;
// }

// const AuthContext = createContext<AuthContextType>({
//   user: null,
//   loading: true,
//   isConfigured: false,
//   signOut: async () => {},
// });

// export function AuthProvider({ children }: { children: React.ReactNode }) {
//   const [user, setUser] = useState<User | DevUser | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [configured, setConfigured] = useState(false);

//   useEffect(() => {
//     const isConf = isSupabaseConfigured();
//     setConfigured(isConf);

//     if (isConf) {
//       const supabase = createClient();

//       // Get initial user
//       supabase.auth.getUser().then(({ data: { user } }) => {
//         setUser(user);
//         setLoading(false);
//       });

//       // Listen for auth state changes
//       const { data: { subscription } } = supabase.auth.onAuthStateChange(
//         (_event, session) => {
//           setUser(session?.user ?? null);
//           setLoading(false);
//         }
//       );

//       return () => {
//         subscription.unsubscribe();
//       };
//     } else {
//       // Check 3dme_dev_session or legacy meshforge_dev_session with one-time migration
//       const cookies = document.cookie.split("; ");
//       let devCookie = cookies.find((row) => row.startsWith("3dme_dev_session="));
//       if (!devCookie) {
//         const legacyCookie = cookies.find((row) => row.startsWith("meshforge_dev_session="));
//         if (legacyCookie) {
//           const val = legacyCookie.split("=")[1];
//           document.cookie = `3dme_dev_session=${val}; path=/; max-age=604800; SameSite=Lax`;
//           document.cookie = `meshforge_dev_session=; path=/; max-age=0; SameSite=Lax`;
//           devCookie = `3dme_dev_session=${val}`;
//         }
//       }
//       if (devCookie) {
//         try {
//           const val = decodeURIComponent(devCookie.split("=")[1]);
//           const parsed = JSON.parse(val);
//           setUser(parsed);
//         } catch {
//           setUser(null);
//         }
//       }
//       setLoading(false);
//     }
//   }, []);

//   const handleSignOut = async () => {
//     await signout();
//     setUser(null);
//   };

//   return (
//     <AuthContext.Provider
//       value={{
//         user,
//         loading,
//         isConfigured: configured,
//         signOut: handleSignOut,
//       }}
//     >
//       {children}
//     </AuthContext.Provider>
//   );
// }

// export function useAuth() {
//   return useContext(AuthContext);
// }
