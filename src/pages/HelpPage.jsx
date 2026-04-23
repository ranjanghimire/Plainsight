import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const navLinks = [
  { id: 'hidden-workspaces', label: 'Hidden workspaces' },
  { id: 'master-key', label: 'Master key' },
  { id: 'composer', label: 'Composer & popover' },
  { id: 'tags-categories', label: 'Tags & categories' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'renaming', label: 'Renaming' },
  { id: 'activity-logs', label: 'Activity logs' },
  { id: 'archive', label: 'Archive' },
];

function Section({ id, eyebrow, title, children }) {
  return (
    <article
      id={id}
      className="scroll-mt-24 rounded-2xl border border-stone-200/90 bg-white/90 p-6 shadow-sm backdrop-blur-sm dark:border-stone-600/80 dark:bg-stone-900/50 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
        {eyebrow}
      </p>
      <h2 className="font-header mt-1 text-xl font-semibold tracking-wide text-stone-900 dark:text-stone-100">
        {title}
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{children}</div>
    </article>
  );
}

export function HelpPage() {
  const navigate = useNavigate();

  /** Avoid <a href="#…">: hash changes fire `popstate`, and BackNavigationLock sends that to home. */
  const jumpToSection = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-25"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[min(42rem,70vh)] w-[150%] rounded-[100%] bg-gradient-to-b from-amber-100/50 via-transparent to-transparent blur-3xl dark:from-amber-900/20" />
        <div className="absolute -right-1/4 bottom-0 h-[min(36rem,55vh)] w-[130%] rounded-[100%] bg-gradient-to-t from-stone-200/40 via-transparent to-transparent blur-3xl dark:from-stone-700/25" />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-2 sm:px-6">
          <div className="flex items-center justify-between gap-3 border-b border-stone-200/80 pb-6 dark:border-stone-700/80">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="shrink-0 rounded-lg px-2 py-1.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            >
              ← Back
            </button>
          </div>

          <header className="py-10 text-center sm:py-14">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-stone-400 dark:text-stone-500">
              Guide
            </p>
            <h1 className="font-header mt-3 text-3xl font-semibold tracking-[0.08em] text-stone-900 sm:text-4xl dark:text-stone-50">
              plainsight
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-stone-600 dark:text-stone-400">
              A calm surface for fast capture, quiet organization, and workspaces that stay yours.
              Below is everything worth knowing—without the noise.
            </p>
          </header>

          <nav
            aria-label="On this page"
            className="sticky top-0 z-10 -mx-4 mb-10 border-b border-stone-200/70 bg-stone-50/90 px-4 py-3 backdrop-blur-md dark:border-stone-700/70 dark:bg-stone-950/85 sm:-mx-6 sm:px-6"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
              Jump to
            </p>
            <div className="flex flex-wrap gap-2">
              {navLinks.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => jumpToSection(id)}
                  className="rounded-full border border-stone-200/90 bg-white/80 px-3 py-1 text-xs font-medium text-stone-700 shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900/80 dark:text-stone-200 dark:hover:border-stone-500 dark:hover:bg-stone-800"
                >
                  {label}
                </button>
              ))}
            </div>
          </nav>

          <div className="space-y-8 sm:space-y-10">
            <Section
              id="hidden-workspaces"
              eyebrow="Spaces"
              title="Hidden workspaces"
            >
              <p>
                Hidden workspaces live off the main tab row—perfect for side projects, drafts, or
                anything you do not want one tap away on the home strip.
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-stone-400 dark:marker:text-stone-500">
                <li>
                  <strong className="font-medium text-stone-800 dark:text-stone-200">Open one:</strong>{' '}
                  in the composer, type a single line starting with a dot and the workspace name,
                  then send—e.g. <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">.my_lab</code> jumps you into that space (underscores for spaces).
                </li>
                <li>
                  <strong className="font-medium text-stone-800 dark:text-stone-200">See them all:</strong>{' '}
                  the <strong>Hidden Workspaces</strong> screen is only opened from the composer—send
                  one line that starts with{' '}
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">..</code>{' '}
                  followed by your master key. The <strong>first</strong> time, no key exists yet: whatever
                  phrase you send <em>becomes</em> your master key and you are taken there. From the{' '}
                  <strong>second</strong> time onward, that line must <em>match</em> your saved key
                  exactly—then you can list, rename, or delete hidden workspaces on that page.
                </li>
                <li>
                  On the free plan you can keep one hidden workspace without sync; with{' '}
                  <strong className="font-medium text-stone-800 dark:text-stone-200">cloud sync</strong>{' '}
                  you can add more and keep them aligned across devices.
                </li>
              </ul>
            </Section>

            <Section id="master-key" eyebrow="Security" title="Master key & reset">
              <p>
                Your <strong className="font-medium text-stone-800 dark:text-stone-200">master key</strong>{' '}
                is the phrase after{' '}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">..</code>{' '}
                in the composer. It is the <em>only</em> way to reach Hidden Workspaces—there is no menu
                shortcut.
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-stone-400 dark:marker:text-stone-500">
                <li>
                  <strong className="font-medium text-stone-800 dark:text-stone-200">First time:</strong>{' '}
                  send <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">..</code>{' '}
                  plus any word or phrase you want to use as your key—that phrase is stored and opens
                  Hidden Workspaces.
                </li>
                <li>
                  <strong className="font-medium text-stone-800 dark:text-stone-200">After that:</strong>{' '}
                  send <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">..</code>{' '}
                  followed by the <em>exact</em> same phrase. If it matches, you return to Hidden
                  Workspaces; it is checked before other double-dot commands run.
                </li>
                <li>
                  If you use cloud sync and forget the key, use{' '}
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">..reset</code>{' '}
                  (composer) to start the email code flow, then follow the prompts to choose a new key
                  when you reach Hidden Workspaces again.
                </li>
              </ul>
            </Section>

            <Section id="composer" eyebrow="Writing" title="Composer & format popover">
              <p>
                Tap the composer to focus it. When it expands, a thin row under the field holds tags
                on the left and formatting on the right.
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-stone-400 dark:marker:text-stone-500">
                <li>
                  Tap the small <strong className="font-medium text-stone-800 dark:text-stone-200">paragraph mark</strong>{' '}
                  icon to reveal the tray: <strong>First line bold</strong>,{' '}
                  <strong>bullets</strong>, and <strong>checklist</strong> toggles apply to the line
                  your cursor is on.
                </li>
                <li>
                  The <strong className="font-medium text-stone-800 dark:text-stone-200">corner arrows</strong>{' '}
                  control a taller writing area—three extra lines of comfortable height—without leaving
                  the note flow. Tap again to tuck it back to the default expanded size.
                </li>
                <li>
                  Send with the inline paper plane or the floating one when the composer is tall—both
                  publish the same way.
                </li>
              </ul>
            </Section>

            <Section id="tags-categories" eyebrow="Structure" title="Tags & categories">
              <p>
                Tags ride <strong className="font-medium text-stone-800 dark:text-stone-200">inside the note</strong>
                : use the <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">#</code>{' '}
                row under the composer (before you send) so lines like{' '}
                <code className="rounded bg-stone-100 px-1.5 py-0.5 text-[13px] dark:bg-stone-800">#idea #client</code>{' '}
                become searchable facets on the card.
              </p>
              <p>
                <strong className="font-medium text-stone-800 dark:text-stone-200">Categories</strong>{' '}
                are the chips above the list: tap one to filter the board, use{' '}
                <strong>+ Add category</strong> to create, and long-press a chip when you need to rename
                or remove a label without disturbing the notes underneath.
              </p>
              <p>
                Open the <strong className="font-medium text-stone-800 dark:text-stone-200">Tags</strong>{' '}
                view from the header when you want a dedicated lens across the workspace.
              </p>
            </Section>

            <Section id="sharing" eyebrow="Collaboration" title="Share a workspace">
              <p>
                Shared workspaces need <strong className="font-medium text-stone-800 dark:text-stone-200">cloud sync</strong>{' '}
                and a paid seat that includes collaboration—invites you accept appear at the top of the
                menu until you join.
              </p>
              <p>
                From the menu, <strong className="font-medium text-stone-800 dark:text-stone-200">press and hold</strong>{' '}
                a workspace you own (not Home). Choose <strong>Share</strong>, enter your collaborator&apos;s
                email, and send the invite. They will see the workspace in their menu after accepting.
              </p>
            </Section>

            <Section id="renaming" eyebrow="Labels" title="Rename workspaces & categories">
              <ul className="list-disc space-y-2 pl-5 marker:text-stone-400 dark:marker:text-stone-500">
                <li>
                  <strong className="font-medium text-stone-800 dark:text-stone-200">Workspace:</strong>{' '}
                  long-press the tab in the menu → <strong>Rename</strong>. Home stays fixed; owned
                  shared workspaces follow the same gesture when you are the owner.
                </li>
                <li>
                  <strong className="font-medium text-stone-800 dark:text-stone-200">Category:</strong>{' '}
                  long-press a category chip above the note list → <strong>Rename</strong>, adjust the
                  inline field, then save—or cancel with Escape.
                </li>
              </ul>
            </Section>

            <Section id="activity-logs" eyebrow="Shared" title="Activity logs">
              <p>
                For workspaces you collaborate on, long-press the shared entry in the menu and choose{' '}
                <strong className="font-medium text-stone-800 dark:text-stone-200">Logs</strong> to open a
                chronological trail—who changed what, and when—without leaving the calm shell of the app.
              </p>
            </Section>

            <Section id="archive" eyebrow="History" title="Archive & restore">
              <p>
                Tap the <strong className="font-medium text-stone-800 dark:text-stone-200">archive</strong>{' '}
                icon in the header to slide into history mode: deleted notes gather here in read-only
                cards so you can review what left the board.
              </p>
              <p>
                When something should come back, use <strong className="font-medium text-stone-800 dark:text-stone-200">Restore</strong>{' '}
                on the card—Plainsight returns it to the active list with its categories intact. Exit
                archive from the same header control when you are done.
              </p>
            </Section>

            <p className="pt-6 text-center text-xs text-stone-400 dark:text-stone-500">
              Plainsight is built for momentum. Close this guide whenever you like—the menu is always
              one tap away.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
