import React, { createContext, useContext, ReactNode } from 'react';
import { AuthState } from '../types/auth';

interface AuthContextType {
    authState: AuthState;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Always authenticated in local mode
    const authState: AuthState = {
        isAuthenticated: true,
        userProfile: {
            username: 'Local User',
            email: 'local@iac-analyzer.local'
        }
    };

    const logout = async () => {
        // No-op in local mode
    };

    return (
        <AuthContext.Provider value={{ authState, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
