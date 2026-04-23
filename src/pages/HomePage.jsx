import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NotesView } from '../components/NotesView';

export function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const fromMasterKeyReset = Boolean(location.state?.fromMasterKeyReset);
  const [revealContent, setRevealContent] = useState(!fromMasterKeyReset);

  useEffect(() => {
    if (!fromMasterKeyReset) {
      setRevealContent(true);
      return undefined;
    }
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => setRevealContent(true));
    });
    const clearStateTimer = window.setTimeout(() => {
      navigate('/', { replace: true, state: {} });
    }, 520);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(clearStateTimer);
    };
  }, [fromMasterKeyReset, navigate]);

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col gap-4 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
        revealContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      }`}
    >
      <NotesView />
    </div>
  );
}
