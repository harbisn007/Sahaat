import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";


// Avatar types: 'male' | 'female' | custom URI
export type AvatarType = 'male' | 'female' | string;

// User account types
export type AccountType = 'guest' | 'google' | 'apple';

interface UserContextType {
  username: string | null;
  userId: string; // Changed from number to string (UUID)
  avatar: AvatarType | null;
  accountType: AccountType;
  googleId: string | null;
  appleId: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  setUsername: (name: string) => Promise<void>;
  setAvatar: (avatar: AvatarType) => Promise<void>;
  setUserData: (name: string, avatar: AvatarType) => Promise<void>;
  loginAsGuest: (name: string, avatar: AvatarType) => Promise<void>;
  loginWithGoogle: (googleId: string, name: string, avatar: AvatarType) => Promise<void>;
  loginWithApple: (appleId: string, name: string, avatar: AvatarType) => Promise<void>;
  logout: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@sahaat_muhawara:username";
const USER_ID_STORAGE_KEY = "@sahaat_muhawara:userId";
const USER_AVATAR_STORAGE_KEY = "@sahaat_muhawara:avatar";
const USER_ACCOUNT_TYPE_KEY = "@sahaat_muhawara:accountType";
const USER_GOOGLE_ID_KEY = "@sahaat_muhawara:googleId";
const USER_APPLE_ID_KEY = "@sahaat_muhawara:appleId";

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [userId, setUserIdState] = useState<string>("");
  const [avatar, setAvatarState] = useState<AvatarType | null>(null);
  const [accountType, setAccountTypeState] = useState<AccountType>("guest");
  const [googleId, setGoogleIdState] = useState<string | null>(null);
  const [appleId, setAppleIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isLoggedIn = !!username && !!userId;

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

      const storedAccountType = await AsyncStorage.getItem(USER_ACCOUNT_TYPE_KEY);
      if (storedAccountType) {
        setAccountTypeState(storedAccountType as AccountType);
      }

      const storedGoogleId = await AsyncStorage.getItem(USER_GOOGLE_ID_KEY);
      if (storedGoogleId) {
        setGoogleIdState(storedGoogleId);
      }

      const storedAppleId = await AsyncStorage.getItem(USER_APPLE_ID_KEY);
      if (storedAppleId) {
        setAppleIdState(storedAppleId);
      }

      // Load or generate UUID
      let storedUserId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      if (storedUserId) {
        setUserIdState(storedUserId);
      }
      // Note: For guests, userId is generated on login, not on app start
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
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      setUsernameState(name);
      setAvatarState(newAvatar);
    } catch (error) {
      console.error("Failed to save user data:", error);
      throw error;
    }
  };

  const loginAsGuest = async (name: string, newAvatar: AvatarType) => {
    console.log("[UserContext] loginAsGuest called with:", { name, avatar: newAvatar });
    
    try {
      // Generate new UUID for guest
      let newUserId: string;
      try {
        // توليد UUID بسيط بدون مكتبات خارجية
        newUserId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
        console.log("[UserContext] Generated UUID:", newUserId);
      } catch (uuidError) {
        console.error("[UserContext] UUID generation failed, using fallback:", uuidError);
        // Fallback: generate a simple unique ID
        newUserId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      console.log("[UserContext] Saving to AsyncStorage...");
      await AsyncStorage.setItem(USER_ID_STORAGE_KEY, newUserId);
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      await AsyncStorage.setItem(USER_ACCOUNT_TYPE_KEY, "guest");
      
      // Clear any existing Google/Apple IDs
      await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
      await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      
      console.log("[UserContext] Updating state...");
      setUserIdState(newUserId);
      setUsernameState(name);
      setAvatarState(newAvatar);
      setAccountTypeState("guest");
      setGoogleIdState(null);
      setAppleIdState(null);
      
      console.log("[UserContext] Logged in as guest successfully:", { userId: newUserId, name });
    } catch (error: any) {
      console.error("[UserContext] Failed to login as guest:", error?.message || error);
      throw error;
    }
  };

  const loginWithGoogle = async (newGoogleId: string, name: string, newAvatar: AvatarType) => {
    try {
      // For Google users, use googleId as the base for UUID (consistent across devices)
      const newUserId = `google_${newGoogleId}`;
      
      await AsyncStorage.setItem(USER_ID_STORAGE_KEY, newUserId);
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      await AsyncStorage.setItem(USER_ACCOUNT_TYPE_KEY, "google");
      await AsyncStorage.setItem(USER_GOOGLE_ID_KEY, newGoogleId);
      await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      
      setUserIdState(newUserId);
      setUsernameState(name);
      setAvatarState(newAvatar);
      setAccountTypeState("google");
      setGoogleIdState(newGoogleId);
      setAppleIdState(null);
      
      console.log("[UserContext] Logged in with Google:", { userId: newUserId, name });
    } catch (error) {
      console.error("Failed to login with Google:", error);
      throw error;
    }
  };

  const loginWithApple = async (newAppleId: string, name: string, newAvatar: AvatarType) => {
    try {
      // For Apple users, use appleId as the base for UUID (consistent across devices)
      const newUserId = `apple_${newAppleId}`;
      
      await AsyncStorage.setItem(USER_ID_STORAGE_KEY, newUserId);
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      await AsyncStorage.setItem(USER_ACCOUNT_TYPE_KEY, "apple");
      await AsyncStorage.setItem(USER_APPLE_ID_KEY, newAppleId);
      await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
      
      setUserIdState(newUserId);
      setUsernameState(name);
      setAvatarState(newAvatar);
      setAccountTypeState("apple");
      setAppleIdState(newAppleId);
      setGoogleIdState(null);
      
      console.log("[UserContext] Logged in with Apple:", { userId: newUserId, name });
    } catch (error) {
      console.error("Failed to login with Apple:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // احذف بيانات الجلسة فقط وأبقِ على USER_ID_STORAGE_KEY (الـ UUID) دائماً
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_AVATAR_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ACCOUNT_TYPE_KEY);
      await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
      await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      // مفاتيح welcome.tsx (Firebase phone auth) - بدون user_uuid
      await AsyncStorage.removeItem('user_name');
      await AsyncStorage.removeItem('user_avatar');
      // لا نحذف USER_ID_STORAGE_KEY ولا 'user_uuid' لأنهما الـ app_user_id
      
      setUsernameState(null);
      setAvatarState(null);
      setAccountTypeState("guest");
      setGoogleIdState(null);
      setAppleIdState(null);
      // لا نصفّر userId لأنه يبقى محفوظاً
      
      console.log("[UserContext] Logged out - session cleared, userId preserved:", userId);
    } catch (error) {
      console.error("Failed to logout:", error);
      throw error;
    }
  };

  const clearAllData = async () => {
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ID_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_AVATAR_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ACCOUNT_TYPE_KEY);
      await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
      await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      // مفاتيح welcome.tsx (Firebase phone auth)
      await AsyncStorage.removeItem('user_uuid');
      await AsyncStorage.removeItem('user_name');
      await AsyncStorage.removeItem('user_avatar');
      
      setUsernameState(null);
      setUserIdState("");
      setAvatarState(null);
      setAccountTypeState("guest");
      setGoogleIdState(null);
      setAppleIdState(null);
      
      console.log("[UserContext] All user data cleared");
    } catch (error) {
      console.error("Failed to clear all data:", error);
      throw error;
    }
  };

  return (
    <UserContext.Provider value={{ 
      username, 
      userId, 
      avatar, 
      accountType,
      googleId,
      appleId,
      isLoading, 
      isLoggedIn,
      setUsername, 
      setAvatar, 
      setUserData,
      loginAsGuest,
      loginWithGoogle,
      loginWithApple,
      logout,
      clearAllData
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
