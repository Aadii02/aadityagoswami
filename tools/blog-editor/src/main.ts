import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/editor.css';
import './styles/prose.css';
import './styles/menus.css';
import './styles/image.css';
import './styles/drafts.css';
import './styles/sidebar.css';
import './styles/preview.css';
import './styles/export.css';

import { newPost } from './model';
import { EditorSession } from './editor/session';
import { DraftsView } from './drafts/view';
import { getPost, slugsExcept } from './store/db';

/* Routes (hash-based, so the built files work from any folder on GitHub Pages):
   #/                    writing desk (drafts list)
   #/new                 a fresh post (becomes #/edit/<id>)
   #/edit/<id>[/preview|/export]   the editor, optionally opening a panel */

const app = document.getElementById('app')!;
let session: EditorSession | null = null;
let routing = Promise.resolve();

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');

  if (hash === 'new') {
    history.replaceState(null, '', `#/edit/${crypto.randomUUID()}`);
  }
  const m = /^edit\/([\w-]+)(?:\/(preview|export))?$/.exec(location.hash.replace(/^#\/?/, ''));

  if (m && session?.post.id === m[1]) {
    if (m[2]) { history.replaceState(null, '', `#/edit/${m[1]}`); session.action(m[2]); }
    return;
  }

  if (session) { const s = session; session = null; await s.destroy(); }

  if (!m) {
    document.title = 'Writing desk — Blog studio';
    await new DraftsView().mount(app);
    return;
  }

  const [, id, panel] = m;
  const stored = await getPost(id);
  const post = stored ?? { ...newPost(), id };
  session = new EditorSession(post, app, { isNew: !stored, takenSlugs: await slugsExcept(id) });
  document.title = `${post.meta.title.trim() || 'New post'} — Blog studio`;
  if (!post.meta.title) session.screen.focusTitle();
  // the panel opens once; the URL goes back to the plain editor so the same link works again
  if (panel) { history.replaceState(null, '', `#/edit/${id}`); session.action(panel); }
  if (import.meta.env.DEV) Object.assign(window, { session, editor: session.editor, post });
}

// routes run one at a time, so a quick back/forward can't open two editors
const run = () => { routing = routing.then(route).catch(err => console.error(err)); };
window.addEventListener('hashchange', run);
run();
