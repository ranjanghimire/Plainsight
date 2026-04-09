import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Match {@link ARCHIVE_SWAP_MS} in ArchiveModeContext — out phase before swapping views */
const TAGS_SWAP_MS = 165;

const TagsNavContext = createContext(null);

const defaultReturnTo = () => ({
  pathname: '/',
  search: '',
  hash: '',
});

function pathFromReturnTo(r) {
  const p = r?.pathname && typeof r.pathname === 'string' ? r.pathname : '/';
  const s = typeof r?.search === 'string' ? r.search : '';
  const h = typeof r?.hash === 'string' ? r.hash : '';
  const full = `${p}${s}${h}`;
  return full || '/';
}

export function TagsNavProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnToRef = useRef(defaultReturnTo());
  const [tagsViewTransitioning, setTagsViewTransitioning] = useState(false);
  const transitionLockRef = useRef(false);
  const timersRef = useRef([]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, []);

  const runTagsTransition = useCallback((afterSwap) => {
    if (transitionLockRef.current) return;
    transitionLockRef.current = true;
    setTagsViewTransitioning(true);
    timersRef.current.forEach(clearTimeout);
    const t = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((id) => id !== t);
      afterSwap();
      requestAnimationFrame(() => {
        setTagsViewTransitioning(false);
        transitionLockRef.current = false;
      });
    }, TAGS_SWAP_MS);
    timersRef.current.push(t);
  }, []);

  const isTagsRoute = location.pathname === '/tags';

  const toggleTagsPage = useCallback(() => {
    if (location.pathname === '/tags') {
      runTagsTransition(() => {
        navigate(pathFromReturnTo(returnToRef.current));
      });
      return;
    }
    returnToRef.current = {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
    };
    runTagsTransition(() => {
      navigate('/tags');
    });
  }, [location.pathname, location.search, location.hash, navigate, runTagsTransition]);

  const goBackFromTags = useCallback(() => {
    if (location.pathname !== '/tags') return;
    runTagsTransition(() => {
      navigate(pathFromReturnTo(returnToRef.current));
    });
  }, [location.pathname, navigate, runTagsTransition]);

  /** Deep-link to /tags (e.g. from a note tag pill) — align Back with that screen. */
  const setTagsReturnTo = useCallback((target) => {
    if (!target || typeof target.pathname !== 'string') return;
    returnToRef.current = {
      pathname: target.pathname,
      search: typeof target.search === 'string' ? target.search : '',
      hash: typeof target.hash === 'string' ? target.hash : '',
    };
  }, []);

  /** Open /tags with the same transition as the header toggle (optional expand + return path). */
  const openTagsPage = useCallback(
    (payload) => {
      const rt = payload?.tagsReturnTo;
      const ex = payload?.expandTag;

      if (location.pathname === '/tags') {
        if (ex != null && typeof ex === 'string') {
          runTagsTransition(() => {
            navigate('/tags', { replace: true, state: { expandTag: ex } });
          });
        }
        return;
      }

      if (rt && typeof rt.pathname === 'string') {
        setTagsReturnTo(rt);
      }
      runTagsTransition(() => {
        navigate('/tags', {
          state: ex != null && typeof ex === 'string' ? { expandTag: ex } : {},
        });
      });
    },
    [location.pathname, navigate, runTagsTransition, setTagsReturnTo],
  );

  const value = useMemo(
    () => ({
      isTagsRoute,
      tagsViewTransitioning,
      toggleTagsPage,
      goBackFromTags,
      setTagsReturnTo,
      openTagsPage,
    }),
    [
      isTagsRoute,
      tagsViewTransitioning,
      toggleTagsPage,
      goBackFromTags,
      setTagsReturnTo,
      openTagsPage,
    ],
  );

  return (
    <TagsNavContext.Provider value={value}>{children}</TagsNavContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is public API
export function useTagsNav() {
  const ctx = useContext(TagsNavContext);
  if (!ctx) {
    throw new Error('useTagsNav must be used within TagsNavProvider');
  }
  return ctx;
}
