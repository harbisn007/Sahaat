import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Platform } from "react-native";

// Avatar types: 'male' | 'female' | custom URI
export type AvatarType = 'male' | 'female' | string;

interface UserContextType {
  username: string | null;
  userId: number;
  avatar: AvatarType | null;
  isLoading: boolean;
  setUsername: (name: string) => Promise<void>;
  setAvatar: (avatar: AvatarType) => Promise<void>;
  setUserData: (name: string, avatar: AvatarType) => Promise<void>;
  logout: () => Promise<void>;
  clearUsername: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@sahaat_muhawara:username";
const USER_ID_STORAGE_KEY = "@sahaat_muhawara:userId";
const USER_AVATAR_STORAGE_KEY = "@sahaat_muhawara:avatar";

// دالة للحصول على عنوان API
function getApiBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }
  return "http://127.0.0.1:3000";
}

// دالة لحذف بيانات الضيف من الخادم
async function deleteGuestDataFromServer(userId: number): Promise<void> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/trpc/users.deleteGuestData`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });
    
    if (!response.ok) {
      console.warn("[UserContext] Server returned error:", response.status);
    } else {
      console.log("[UserContext] Server data deleted for user:", userId);
    }
  } catch (error) {
    console.error("[UserContext] Failed to delete server data:", error);
    // نستمر في حذف البيانات المحلية حتى لو فشل الخادم
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [userId, setUserIdState] = useState<number>(0);
  const [avatar, setAvatarState] = useState<AvatarType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUsername) {
        setUsernameState(storedUsername);
      }

      const storedAvatar = await AsyncStorage.getItem(USER_AVATAR_STORAGE_KEY);
      if (storedAvatar) {
        setAvatarState(storedAvatar as AvatarType);
      }

      let storedUserId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      if (storedUserId) {
        setUserIdState(Number(storedUserId));
      }
      // لا نولّد userId جديد هنا - سيتم توليده عند تسجيل الدخول
    } catch (error) {
      console.error("Failed to load user data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const setUsername = async (name: string) => {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      setUsernameState(name);
    } catch (error) {
      console.error("Failed to save username:", error);
      throw error;
    }
  };

  const setAvatar = async (newAvatar: AvatarType) => {
    try {
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      setAvatarState(newAvatar);
    } catch (error) {
      console.error("Failed to save avatar:", error);
      throw error;
    }
  };

  const setUserData = async (name: string, newAvatar: AvatarType) => {
    try {
      // توليد userId جديد عند كل تسجيل دخول
      const newUserId = Math.floor(Math.random() * 1000000000);
      
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      await AsyncStorage.setItem(USER_ID_STORAGE_KEY, String(newUserId));
      
      setUsernameState(name);
      setAvatarState(newAvatar);
      setUserIdState(newUserId);
      
      console.log("[UserContext] New user registered with ID:", newUserId);
    } catch (error) {
      console.error("Failed to save user data:", error);
      throw error;
    }
  };

  // دالة تسجيل الخروج الكاملة - تحذف كل شيء
  const logout = async () => {
    try {
      // 1. حذف بيانات المستخدم من الخادم (الساحة والمشاركات)
      if (userId > 0) {
        await deleteGuestDataFromServer(userId);
      }

      // 2. حذف جميع البيانات المحلية
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_AVATAR_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ID_STORAGE_KEY);
      
      // 3. إعادة تعيين الحالة
      setUsernameState(null);
      setAvatarState(null);
      setUserIdState(0);
      
      console.log("[UserContext] User logged out completely");
    } catch (error) {
      console.error("Failed to logout:", error);
      throw error;
    }
  };

  // دالة قديمة للتوافق - تستدعي logout
  const clearUsername = async () => {
    await logout();
  };

  return (
    <UserContext.Provider value={{ 
      username, 
      userId, 
      avatar, 
      isLoading, 
      setUsername, 
      setAvatar, 
      setUserData, 
      logout,
      clearUsername 
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
