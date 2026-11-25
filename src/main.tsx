import './fonts.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ShelfPage } from './shelf/ShelfPage';
import { boardIdFromUrl } from './collab/connection';
import './styles.css';
import { keepMenusOnScreen } from './ui/onScreen';
import { fadeOutPopups } from './ui/leaving';
import { keepLinksHere } from './route';
import { homePageFromUrl } from './shelf/Navigation';

/** The canvas or the home page, with profile, settings and help under the same header. */
function Root() {
  const [boardId, setBoardId] = useState(boardIdFromUrl);
  const [page, setPage] = useState(homePageFromUrl);
  useEffect(() => {
    const on = () => { setBoardId(boardIdFromUrl()); setPage(homePageFromUrl()); };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return (
    <div className={`app-shell ${boardId ? 'on-board' : ''}`}>
      <div className="app-content">{boardId ? <App key={boardId} boardId={boardId} /> : <ShelfPage page={page} />}</div>
    </div>
  );
}

// No StrictMode: its double-mounted effects would open and close the sync connection twice.
keepMenusOnScreen();
fadeOutPopups();
keepLinksHere();
// The panels' own font (Inter, its weights the panels use) fetched at once, not on a panel's first
// showing: else its words change face as it comes in (the text panel's, say, at the end of «T»).
for (const w of [500, 600, 700]) void document.fonts?.load(`${w} 1em Inter`, 'Аa');
createRoot(document.getElementById('root')!).render(<Root />);
