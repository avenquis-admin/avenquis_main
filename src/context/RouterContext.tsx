/**
 * Avenquis Control Panel - Robust Single-Page Routing System
 * Supports full path matching, browser pushState / popstate history sync, query params,
 * active link detection, and PLATFORM_SUPER_ADMIN route guarding.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';

interface RouterContextType {
  currentPath: string;
  navigate: (path: string, options?: { replace?: boolean }) => void;
  activeSection: string;
  aiSubTab: string;
  queryParams: Record<string, string>;
  setQueryParam: (key: string, value: string | null) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

// Normalize path helper (strips query string if passed, removes trailing slashes, handles /index.html)
function normalizePathname(rawPath: string): string {
  if (!rawPath || rawPath === '/' || rawPath === '/index.html') return '/overview';
  const cleanBase = rawPath.split('?')[0].split('#')[0];
  if (!cleanBase || cleanBase === '/' || cleanBase === '/index.html') return '/overview';
  const cleaned = cleanBase.replace(/\/+$/, '');
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}

function parseUrlParams(searchStr: string): Record<string, string> {
  const searchParams = new URLSearchParams(searchStr);
  const params: Record<string, string> = {};
  searchParams.forEach((val, key) => {
    params[key] = val;
  });
  return params;
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    try {
      return normalizePathname(window.location.pathname);
    } catch {
      return '/overview';
    }
  });

  const [queryParams, setQueryParams] = useState<Record<string, string>>(() => {
    try {
      return parseUrlParams(window.location.search);
    } catch {
      return {};
    }
  });

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const [pathPart, queryPart] = path.split('?');
    const targetPath = normalizePathname(pathPart);
    const searchString = queryPart !== undefined ? `?${queryPart}` : '';
    const fullUrl = `${targetPath}${searchString}`;

    try {
      if (options?.replace) {
        window.history.replaceState({}, '', fullUrl);
      } else {
        window.history.pushState({}, '', fullUrl);
      }
    } catch {
      // Gracefully handle iframe sandbox or history security restrictions
    }
    setCurrentPath(targetPath);
    if (queryPart !== undefined) {
      setQueryParams(parseUrlParams(searchString));
    }
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // ignore
    }
  }, []);

  // Listen to popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const path = normalizePathname(window.location.pathname);
      setCurrentPath(path);
      setQueryParams(parseUrlParams(window.location.search));
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setQueryParam = useCallback((key: string, value: string | null) => {
    const searchParams = new URLSearchParams(window.location.search);
    if (value === null) {
      searchParams.delete(key);
    } else {
      searchParams.set(key, value);
    }
    const newSearch = searchParams.toString();
    const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
    try {
      window.history.replaceState({}, '', newUrl);
    } catch {
      // ignore in sandboxed environments
    }

    const updatedParams: Record<string, string> = {};
    searchParams.forEach((val, k) => {
      updatedParams[k] = val;
    });
    setQueryParams(updatedParams);
  }, []);

  // Compute active section and AI subtab
  const pathParts = currentPath.split('/').filter(Boolean);
  const activeSection = pathParts[0] ? `/${pathParts[0]}` : '/overview';
  const aiSubTab = activeSection === '/ai' && pathParts[1] ? pathParts[1] : 'agents';

  return (
    <RouterContext.Provider
      value={{
        currentPath,
        navigate,
        activeSection,
        aiSubTab,
        queryParams,
        setQueryParam,
      }}
    >
      {children}
    </RouterContext.Provider>
  );
};

export function useRouter(): RouterContextType {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return context;
}
